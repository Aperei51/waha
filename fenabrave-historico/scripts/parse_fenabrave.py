"""Extrai dados de Automóveis e Comerciais Leves dos Informativos mensais Fenabrave (PDF).

Uso: python3 -I parse_fenabrave.py <pasta_pdfs> <pasta_saida>
PDFs nomeados AAAA_MM.pdf.
"""
import csv
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

NUM = r"\d{1,3}(?:\.\d{3})*"

SEG_MAP = {
    "VEICULOS DE ENTRADA": "AU - ENTRADA",
    "HATCH PEQUENOS": "AU - HATCH PEQUENO",
    "HATCH MEDIOS": "AU - HATCH MEDIO",
    "HATCH GRANDES": "AU - HATCH GRANDE",
    "SEDANS PEQUENOS": "AU - SEDAN PEQUENO",
    "SEDANS COMPACTOS": "AU - SEDAN COMPACTO",
    "SEDANS MEDIOS": "AU - SEDAN MEDIO",
    "SEDANS GRANDES": "AU - SEDAN GRANDE",
    "SW PEQUENOS": "AU - SW PEQUENO",
    "SW MEDIOS": "AU - SW MEDIO",
    "SW GRANDES": "AU - SW GRANDE",
    "MONOCAB": "AU - MONOCAB",
    "GRANDCAB": "AU - GRANDCAB",
    "SPORTS": "AU - SPORT",
    "SUV'S": "AU - SUVs",
    "SUVS": "AU - SUVs",
    "SUV S": "AU - SUVs",
    "VETCULOS DE ENTRADA": "AU - ENTRADA",
    "HATCH MPDIOS": "AU - HATCH MEDIO",
    "SEDANS MPDIOS": "AU - SEDAN MEDIO",
    "SW MPDIOS": "AU - SW MEDIO",
    "PICKUP'S PEQUENAS": "CL - PICK-UP PEQUENA",
    "PICKUP'S GRANDES": "CL - PICK-UP GRANDE",
    "PICK-UP S PEQUENAS": "CL - PICK-UP PEQUENA",
    "PICK-UP S GRANDES": "CL - PICK-UP GRANDE",
    "PICK-UP'S PEQUENAS": "CL - PICK-UP PEQUENA",
    "PICK-UP'S GRANDES": "CL - PICK-UP GRANDE",
    "FURGOES": "CL - FURGAO",
    "FURGOES PEQUENOS": "CL - FURGAO PEQUENO",
}

MESES = {"JANEIRO": 1, "FEVEREIRO": 2, "MARCO": 3, "ABRIL": 4, "MAIO": 5, "JUNHO": 6,
         "JULHO": 7, "AGOSTO": 8, "SETEMBRO": 9, "OUTUBRO": 10, "NOVEMBRO": 11, "DEZEMBRO": 12}


def norm(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", s).strip().upper()


def to_int(s):
    return int(s.replace(".", ""))


def split_model(nome):
    nome = re.sub(r"\s+", " ", nome).strip()
    if "/" in nome:
        fab, mod = nome.split("/", 1)
        return fab.strip(), mod.strip()
    return nome, nome


# Alguns PDFs (ex.: 2020, 2024) embutem fontes com a tabela de caracteres deslocada em 29
# posições: "5HVXPR" = "Resumo", dígitos viram caracteres de controle.
GARBLED = re.compile(r"[\x01-\x08\x0b\x0e-\x1f]")
SHIFT_EXTRA = {"m": "ã", "}": "õ", "\u00cf": "Ô", "\u00a7": "ç", "o": "ç"}


def fix_line(ln):
    if not GARBLED.search(ln):
        return ln
    out = []
    for c in ln:
        o = ord(c)
        if c == " " or c == "\u00ac":
            out.append(" ")
        elif 0x01 <= o <= 0x61:
            out.append(chr(o + 29))
        else:
            out.append(SHIFT_EXTRA.get(c, c))
    return "".join(out)


def unshift(ln):
    return "".join(chr(ord(c) + 29) if 0x21 <= ord(c) <= 0x61 else SHIFT_EXTRA.get(c, c) for c in ln)


def pdftext(pdf, first=None):
    cmd = ["pdftotext", "-layout"] + (["-f", str(first), "-l", str(first)] if first else []) + [str(pdf), "-"]
    return subprocess.run(cmd, capture_output=True, text=True, check=True).stdout


def pages(pdf):
    txt = pdftext(pdf).replace("\x9e", "º").replace("\u00ac", " ")
    if not GARBLED.search(txt):
        return txt.split("\f")
    # Com fonte deslocada, ")" vira \f: extrai página a página para não quebrar errado.
    n = int(re.search(r"Pages:\s+(\d+)", subprocess.run(["pdfinfo", str(pdf)], capture_output=True, text=True).stdout).group(1))
    out = []
    for i in range(1, n + 1):
        pg = pdftext(pdf, i).replace("\x9e", "º").replace("\u00ac", " ").rstrip("\f").replace("\f", ")")
        out.append("\n".join(fix_line(ln) for ln in pg.split("\n")))
    return out


def title_of(page):
    for ln in page.splitlines():
        n = norm(ln)
        if not n or n.startswith("ED.") or n.startswith("INFORMATIVO") or n.startswith("SAO PAULO,"):
            continue
        return n
    return ""


ROW_SEG = re.compile(rf"^\s*\d+º?\s+(.+?)\s+({NUM})\s+({NUM})\s+(?:=\s+)?({NUM})\s+[\d,]+%")
ROW_RANK2 = re.compile(rf"(?<![\d.,])(\d+)º?\s+(\S.*?)\s+({NUM})(?:\s+[\d,]+%)?(?=\s{{2,}}\d+º?\s|\s*$)")


UNKNOWN = set()
KINDS = ("modelo", "modelo_ant", "marca", "marca_acum", "tipovenda", "total", "total_ant")


def parse_pdf(pdf, ano, mes):
    out = {k: [] for k in KINDS}
    out["mes_titulo"] = None
    cat = None  # categoria corrente nas páginas de modelos por segmento
    seg = None
    for page in pages(pdf):
        t = title_of(page)
        lines = page.splitlines()

        if t.startswith("RESUMO MENSAL"):
            m = re.match(r"RESUMO MENSAL (\w+) DE (\d{4})", t)
            if m:
                out["mes_titulo"] = (int(m.group(2)), MESES.get(m.group(1)))
            for ln in lines:
                m = re.match(rf"^\s*(A\)?\s+Autos|B\)?\s+Com\. Leves)\s+({NUM})\s+({NUM})\s", ln)
                if m and len(out["total"]) < 2:
                    c = "Automóveis" if m.group(1).startswith("A") else "Comerciais Leves"
                    out["total"].append((c, to_int(m.group(2))))
                    out["total_ant"].append((c, to_int(m.group(3))))

        elif t.startswith("MODELOS MAIS EMPLACADOS ACUMULADO"):
            for ln in lines:
                n = norm(ln)
                if n and len(n) < 40 and not ROW_SEG.match(ln):
                    u = norm(unshift(ln.strip()))
                    if u in SEG_MAP or u in ("AUTOMOVEIS", "COMERCIAIS LEVES", "CAMINHOES", "MOTOS"):
                        n = u
                if n == "AUTOMOVEIS":
                    cat, seg = "Automóveis", None
                    continue
                if n == "COMERCIAIS LEVES":
                    cat, seg = "Comerciais Leves", None
                    continue
                if n in ("CAMINHOES", "CAMINOES", "MOTOS", "MOTOCICLETAS"):
                    cat, seg = None, None
                    continue
                if cat is None:
                    continue
                if n in SEG_MAP:
                    seg = SEG_MAP[n]
                    continue
                if n and not re.search(r"\d", n) and len(n) < 40 and "ACUMULADO" not in n:
                    UNKNOWN.add(n)
                    if not any(k in n + norm(unshift(n)) for k in ("INFORMATIVO", "ACUMULADO", "MODELO PART", "SUB SEGMENTO")):
                        seg = None
                    continue
                m = ROW_SEG.match(ln)
                if m and seg:
                    fab, mod = split_model(m.group(1))
                    out["modelo"].append((cat, seg, fab, mod, to_int(m.group(3))))
                    out["modelo_ant"].append((cat, seg, fab, mod, to_int(m.group(2))))

        elif t.startswith("RANKING POR MARCA"):
            if "COMERCIAIS LEVES" not in norm(page):
                continue
            kind = "marca_acum" if "ACUMULADO" in t else "marca"
            for ln in lines:
                if norm(ln).startswith("AUTOMOVEIS + COMERCIAIS"):
                    break
                for i, m in enumerate(ROW_RANK2.finditer(ln)):
                    if not re.search(r"[A-Z]", m.group(2)):
                        continue
                    c = "Automóveis" if i == 0 and m.start() < 40 else "Comerciais Leves"
                    out[kind].append((c, m.group(2).strip(), to_int(m.group(3))))

        elif re.match(r"MODELOS MAIS EMPLACADOS VENDA (DIRETA|VAREJO) ", t):
            tipo = "Direta" if "DIRETA" in t else "Varejo"
            for ln in lines:
                for m in ROW_RANK2.finditer(ln):
                    if not re.search(r"[A-Z]", m.group(2)):
                        continue
                    c = "Automóveis" if m.start() < 40 else "Comerciais Leves"
                    fab, mod = split_model(m.group(2))
                    out["tipovenda"].append((c, tipo, fab, mod, to_int(m.group(3))))
    return out


def main():
    src, dst = Path(sys.argv[1]), Path(sys.argv[2])
    dst.mkdir(parents=True, exist_ok=True)
    rows = {k: [] for k in KINDS}
    for pdf in sorted(src.glob("[12][0-9][0-9][0-9]_[01][0-9].pdf")):
        ano, mes = map(int, pdf.stem.split("_"))
        if ano >= 2026 or (ano, mes) > (2025, 1):
            continue  # jan/2025 só serve para a coluna "mês anterior" (dez/2024)
        res = parse_pdf(pdf, ano, mes)
        tit = res.pop("mes_titulo")
        if tit not in (None, (ano, mes)) and (src / f"{tit[0]:04d}_{tit[1]:02d}.pdf").exists():
            print(f"AVISO: {pdf.name} contém {tit[1]:02d}/{tit[0]}, que já tem arquivo próprio; ignorado", file=sys.stderr)
            continue
        if tit not in (None, (ano, mes)):
            # Arquivo publicado no mês errado (ex.: 2005_04 traz maio/2005): aproveita só a
            # coluna "mês anterior", que é o mês que faltava.
            print(f"AVISO: {pdf.name} contém {tit[1]:02d}/{tit[0]}; usado só para o mês anterior", file=sys.stderr)
            ano, mes = tit
            res = {k: (v if k.endswith("_ant") else []) for k, v in res.items()}
        pa, pm = (ano, mes - 1) if mes > 1 else (ano - 1, 12)
        for k, lst in res.items():
            a, mm = (pa, pm) if k.endswith("_ant") else (ano, mes)
            for r in lst:
                rows[k].append((f"{a:04d}-{mm:02d}-01", a, mm, a * 100 + mm) + r)
    base = ["Data", "Ano", "Mes", "Ano Mes"]
    heads = {
        "modelo": base + ["Categoria", "Sub Segmento", "Fabricante", "Modelo", "Qtd Emplacamentos"],
        "modelo_ant": base + ["Categoria", "Sub Segmento", "Fabricante", "Modelo", "Qtd Emplacamentos"],
        "marca": base + ["Categoria", "Fabricante", "Qtd Emplacamentos"],
        "marca_acum": base + ["Categoria", "Fabricante", "Qtd Acumulada Ano"],
        "total_ant": base + ["Categoria", "Qtd Emplacamentos"],
        "tipovenda": base + ["Categoria", "Tipo de Venda", "Fabricante", "Modelo", "Qtd Emplacamentos"],
        "total": base + ["Categoria", "Qtd Emplacamentos"],
    }
    for k, lst in rows.items():
        with open(dst / f"raw_{k}.csv", "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f, delimiter=";")
            w.writerow(heads[k])
            w.writerows(lst)
        print(k, len(lst))
    print("Cabeçalhos ignorados:", sorted(UNKNOWN), file=sys.stderr)


if __name__ == "__main__":
    main()
