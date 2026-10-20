"""Monta a base histórica (pré-2025) a partir dos CSVs brutos gerados por parse_fenabrave.py.

Uso: python3 -I build_base.py <pasta_raw> <pasta_saida>
"""
import sys
from pathlib import Path

import pandas as pd

src, dst = Path(sys.argv[1]), Path(sys.argv[2])
dst.mkdir(parents=True, exist_ok=True)

rd = lambda k: pd.read_csv(src / f"raw_{k}.csv", sep=";")
keys = ["Data", "Ano", "Mes", "Ano Mes", "Categoria"]
ORIG_MES = "Relatório do próprio mês"
ORIG_ANT = "Relatório do mês seguinte (coluna mês anterior)"
ORIG_ACUM = "Calculado pela diferença do acumulado"


def only_hist(df):
    return df[df["Ano"].between(2003, 2024)].copy()


def pick(prim, ant):
    """Usa o relatório do mês; se o mês faltar ou vier incompleto, usa a coluna 'mês anterior'
    do relatório seguinte."""
    prim, ant = only_hist(prim), only_hist(ant)
    prim["Origem do Dado"], ant["Origem do Dado"] = ORIG_MES, ORIG_ANT
    sp = prim.groupby(keys)["Qtd Emplacamentos"].sum()
    sa = ant.groupby(keys)["Qtd Emplacamentos"].sum()
    usar_ant = [k for k in sa.index if k not in sp.index or sa[k] > sp[k] * 1.1]
    idx = pd.MultiIndex.from_tuples(usar_ant, names=keys) if usar_ant else None
    if idx is None:
        return prim
    pi = prim.set_index(keys).index.isin(idx)
    ai = ant.set_index(keys).index.isin(idx)
    return pd.concat([prim[~pi], ant[ai]], ignore_index=True)


total = pick(rd("total"), rd("total_ant"))
modelo = pick(rd("modelo"), rd("modelo_ant"))
tv = only_hist(rd("tipovenda"))

# Marcas: preenche meses sem ranking mensal pela diferença dos rankings acumulados.
marca = only_hist(rd("marca"))
marca["Origem do Dado"] = ORIG_MES
acum = rd("marca_acum").set_index(["Ano", "Mes", "Categoria", "Fabricante"])["Qtd Acumulada Ano"]
mens = marca.set_index(["Ano", "Mes", "Categoria", "Fabricante"])["Qtd Emplacamentos"]
tem = set(map(tuple, marca[["Ano", "Mes", "Categoria"]].drop_duplicates().values))
extra = []
for ano in range(2003, 2025):
    for mes in range(1, 13):
        for cat in ("Automóveis", "Comerciais Leves"):
            if (ano, mes, cat) in tem:
                continue
            def ac(a, m):
                if m == 0:
                    return {}
                try:
                    return acum.xs((a, m, cat), level=[0, 1, 2]).to_dict()
                except KeyError:
                    return None
            cur, prev = ac(ano, mes), ac(ano, mes - 1)
            vals = None
            if cur and prev is not None:
                vals = {f: q - prev.get(f, 0) for f, q in cur.items() if mes == 1 or f in prev}
            elif mes < 12 and prev is not None:
                nxt = ac(ano, mes + 1)
                try:
                    mn = mens.xs((ano, mes + 1, cat), level=[0, 1, 2]).to_dict()
                except KeyError:
                    mn = None
                if nxt and mn:
                    vals = {f: q - mn[f] - prev.get(f, 0) for f, q in nxt.items()
                            if f in mn and (mes == 1 or f in prev)}
            for f, q in (vals or {}).items():
                if q > 0:
                    extra.append({"Data": f"{ano:04d}-{mes:02d}-01", "Ano": ano, "Mes": mes, "Ano Mes": ano * 100 + mes,
                                  "Categoria": cat, "Fabricante": f, "Qtd Emplacamentos": q, "Origem do Dado": ORIG_ACUM})
marca = pd.concat([marca, pd.DataFrame(extra)], ignore_index=True)

modelo = modelo.groupby(keys + ["Sub Segmento", "Fabricante", "Modelo", "Origem do Dado"], as_index=False)["Qtd Emplacamentos"].sum()
marca = marca.groupby(keys + ["Fabricante", "Origem do Dado"], as_index=False)["Qtd Emplacamentos"].sum()
tv = tv.groupby(keys + ["Tipo de Venda", "Fabricante", "Modelo"], as_index=False)["Qtd Emplacamentos"].sum()


def residual(det, label_cols):
    soma = det.groupby(keys, as_index=False)["Qtd Emplacamentos"].sum().rename(columns={"Qtd Emplacamentos": "Detalhado"})
    r = total.merge(soma, on=keys, how="left").fillna({"Detalhado": 0})
    r["Qtd Emplacamentos"] = r["Qtd Emplacamentos"] - r["Detalhado"]
    r = r[r["Qtd Emplacamentos"] > 0].drop(columns="Detalhado")
    for c, v in label_cols.items():
        r[c] = r["Categoria"].map(v) if isinstance(v, dict) else v
    return r


modelo["Detalhamento"] = "Modelo"
res_m = residual(modelo, {
    "Sub Segmento": {"Automóveis": "AU - NÃO DETALHADO", "Comerciais Leves": "CL - NÃO DETALHADO"},
    "Fabricante": "OUTROS", "Modelo": "OUTROS (NÃO DETALHADO)", "Detalhamento": "Residual",
    "Origem do Dado": "Total oficial menos modelos detalhados"})
fmodelo = pd.concat([modelo, res_m], ignore_index=True)

marca["Detalhamento"] = "Marca"
res_b = residual(marca, {"Fabricante": "OUTRAS MARCAS", "Detalhamento": "Residual",
                         "Origem do Dado": "Total oficial menos marcas detalhadas"})
fmarca = pd.concat([marca, res_b], ignore_index=True)

for df in (fmodelo, fmarca, tv, total):
    df["Fonte"] = "Fenabrave - Informativo Emplacamentos"
    df["Data"] = pd.to_datetime(df["Data"])
    df.sort_values(["Data", "Categoria"], inplace=True, kind="stable")

fmodelo = fmodelo[keys + ["Sub Segmento", "Fabricante", "Modelo", "Detalhamento", "Qtd Emplacamentos", "Origem do Dado", "Fonte"]]
fmarca = fmarca[keys + ["Fabricante", "Detalhamento", "Qtd Emplacamentos", "Origem do Dado", "Fonte"]]
total = total[keys + ["Qtd Emplacamentos", "Origem do Dado", "Fonte"]]
tv = tv[keys + ["Tipo de Venda", "Fabricante", "Modelo", "Qtd Emplacamentos", "Fonte"]]

MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
cal = pd.DataFrame({"Data": pd.date_range("2003-01-01", "2024-12-01", freq="MS")})
cal["Ano"], cal["Mes"] = cal["Data"].dt.year, cal["Data"].dt.month
cal["Ano Mes"] = cal["Ano"] * 100 + cal["Mes"]
cal["Mes Nome"] = cal["Mes"].map(lambda m: MESES[m - 1])
cal["Trimestre"] = "T" + ((cal["Mes"] - 1) // 3 + 1).astype(str)

tabelas = {
    "Hist_Calendario": cal,
    "Hist_Emplac_Modelo": fmodelo,
    "Hist_Emplac_Marca": fmarca,
    "Hist_Emplac_TipoVenda": tv,
    "Hist_Emplac_Total": total,
}

# Conferência: modelo e marca (com residual) devem fechar no total oficial.
conf = total[keys + ["Qtd Emplacamentos"]].rename(columns={"Qtd Emplacamentos": "Total Oficial"})
for nome, df in (("Soma Modelos", fmodelo), ("Soma Marcas", fmarca)):
    conf = conf.merge(df.groupby(keys, as_index=False)["Qtd Emplacamentos"].sum().rename(columns={"Qtd Emplacamentos": nome}), on=keys, how="left")
det = fmodelo[fmodelo["Detalhamento"] == "Modelo"].groupby(keys, as_index=False)["Qtd Emplacamentos"].sum().rename(columns={"Qtd Emplacamentos": "Detalhado por Modelo"})
conf = conf.merge(det, on=keys, how="left")
conf["% Detalhado por Modelo"] = (conf["Detalhado por Modelo"] / conf["Total Oficial"]).round(4)
tabelas["Conferencia"] = conf

for df in tabelas.values():
    for c in ("Qtd Emplacamentos", "Total Oficial", "Soma Modelos", "Soma Marcas", "Detalhado por Modelo"):
        if c in df:
            df[c] = df[c].fillna(0).astype("int64")

for nome, df in tabelas.items():
    df.to_csv(dst / f"{nome}.csv", sep=";", index=False, encoding="utf-8-sig", date_format="%Y-%m-%d")
with pd.ExcelWriter(dst / "Emplacamentos_Historico_Fenabrave_2003_2024.xlsx", engine="openpyxl",
                    datetime_format="dd/mm/yyyy") as xw:
    for nome, df in tabelas.items():
        df.to_excel(xw, sheet_name=nome, index=False)
        ws = xw.sheets[nome]
        ws.freeze_panes = "A2"
        ws.auto_filter.ref = ws.dimensions
        for col in ws.columns:
            ws.column_dimensions[col[0].column_letter].width = max(10, min(40, len(str(col[0].value)) + 4))

for nome, df in tabelas.items():
    print(nome, len(df))
print(conf[["% Detalhado por Modelo"]].describe())
