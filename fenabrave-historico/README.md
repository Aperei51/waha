# Emplacamentos históricos Fenabrave (2003–2024): Automóveis e Comerciais Leves

Base **separada** do modelo `Emplacamentos_Rede` (que começa em 01/01/2025). Nada aqui altera a base atual:
são tabelas novas, com prefixo `Hist_`, para importar em um modelo próprio ou como tabelas extras.

- **Fonte:** Fenabrave, *Informativo Emplacamentos* mensal (PDF público em fenabrave.org.br → Emplacamentos)
- **Período:** jan/2003 a dez/2024 (264 meses)
- **Escopo:** somente **Automóveis** e **Comerciais Leves** (sem caminhões, ônibus, motos e implementos)
- **Granularidade:** Brasil × mês. A Fenabrave não publica UF, município nem concessionária nesses relatórios.

## Arquivos (`dados/`)

| Arquivo | O que tem | Linhas |
|---|---|---|
| `Emplacamentos_Historico_Fenabrave_2003_2024.xlsx` | Todas as tabelas abaixo, uma por aba | |
| `Hist_Emplac_Total.csv` | Total oficial do mês por categoria | 528 |
| `Hist_Emplac_Modelo.csv` | Emplacamentos por **modelo**, com segmento Fenabrave | 45.751 |
| `Hist_Emplac_Marca.csv` | Emplacamentos por **marca** | 10.593 |
| `Hist_Emplac_TipoVenda.csv` | Top 50 modelos por mês em **Venda Direta** e **Varejo** | 44.992 |
| `Hist_Calendario.csv` | Calendário mensal 2003–2024 | 264 |
| `Conferencia.csv` | Total oficial × soma por modelo × soma por marca, mês a mês | 528 |

CSV: separador `;`, UTF-8, data no formato `AAAA-MM-DD`.

### Colunas

Comuns: `Data` (1º dia do mês), `Ano`, `Mes`, `Ano Mes` (AAAAMM), `Categoria` (`Automóveis` | `Comerciais Leves`),
`Qtd Emplacamentos`.

- `Sub Segmento`: mesmo padrão do modelo atual (`AU - SUVs`, `AU - HATCH PEQUENO`, `CL - PICK-UP GRANDE`...).
- `Fabricante` / `Modelo`: grafia da Fenabrave, igual à do modelo atual (`JEEP` / `RENEGADE`, `VW` / `T CROSS`).
- `Detalhamento`: `Modelo`/`Marca` = linha publicada; `Residual` = diferença até o total oficial (ver abaixo).
- `Tipo de Venda`: `Direta` | `Varejo`.
- `Origem do Dado`: de onde veio o número (ver "Lacunas").

## Como os números fecham

A Fenabrave publica a lista de modelos por segmento e o ranking de marcas **até um limite de posições**.
Para que qualquer soma bata com o mercado, cada mês ganha uma linha **Residual**:

- Modelo: `OUTROS (NÃO DETALHADO)`, sub segmento `AU - NÃO DETALHADO` / `CL - NÃO DETALHADO`
- Marca: `OUTRAS MARCAS`

Assim, `Hist_Emplac_Modelo` e `Hist_Emplac_Marca` somam **exatamente** o total oficial em todos os 528
mês×categoria (ver `Conferencia.csv`). Em média 99% do volume está identificado por modelo.

`Hist_Emplac_TipoVenda` **não** tem residual: a Fenabrave só publica os 50 modelos mais emplacados de cada
tipo de venda. Use essa tabela para ranking e participação Direta × Varejo dos líderes, não para total de mercado.

## Lacunas e como foram tratadas

| Mês | Problema no PDF | Tratamento |
|---|---|---|
| out/2003 | Relatório com erro do servidor (metade dos modelos de Autos faltando) | Modelos e total pela coluna "mês anterior" do relatório de nov/2003; Tipo de Venda incompleto |
| mar/2005 | Relatório com erro do servidor | Total oficial ok; só 43% dos Autos identificados por modelo, sem lista de CL (resto no residual); Tipo de Venda incompleto |
| abr/2005 | O site publica o PDF de maio no lugar de abril | Modelos e total pela coluna "mês anterior" de mai/2005; marcas pela diferença do acumulado; sem Tipo de Venda |
| jan/2022 | Ranking de marcas de Automóveis ausente no PDF | Marcas de Autos 100% em `OUTRAS MARCAS` (modelos ok) |
| set/2023 | PDF só com imagem, sem texto | Modelos e total pelo relatório de out/2023; marcas pela diferença do acumulado; sem Tipo de Venda |
| 2020 e 2024 (alguns meses) | Fonte com codificação deslocada | Decodificada pelo script, sem perda |

Os relatórios trazem pequenas revisões entre um mês e outro (diferença típica de 0 a 20 unidades). A base usa
sempre o número publicado no relatório do próprio mês.

## Como usar no Power BI sem mexer na base atual

**Opção recomendada: modelo novo.** Crie um PBIX `Emplacamentos_Historico_Fenabrave`, importe o Excel e publique
no workspace *Producao Dados* ao lado do `Emplacamentos_Rede`.

1. Obter dados → Excel → `Emplacamentos_Historico_Fenabrave_2003_2024.xlsx`
2. Marque as abas `Hist_Calendario`, `Hist_Emplac_Modelo`, `Hist_Emplac_Marca`, `Hist_Emplac_TipoVenda`, `Hist_Emplac_Total`
3. Relacionamentos (1:N, filtro único): `Hist_Calendario[Data]` → `Data` de cada tabela `Hist_Emplac_*`
4. Marque `Hist_Calendario` como tabela de datas

**Opção alternativa: mesmo PBIX, tabelas isoladas.** Importe as mesmas abas no PBIX do `Emplacamentos_Rede`
**sem** relacioná-las às tabelas existentes. As tabelas e medidas atuais continuam iguais.

Power Query (ajuste o caminho):

```powerquery
let
    Fonte = Excel.Workbook(File.Contents("C:\Dados\Emplacamentos_Historico_Fenabrave_2003_2024.xlsx"), true),
    Modelo = Fonte{[Item = "Hist_Emplac_Modelo", Kind = "Sheet"]}[Data],
    Tipos = Table.TransformColumnTypes(Modelo, {
        {"Data", type date}, {"Ano", Int64.Type}, {"Mes", Int64.Type}, {"Ano Mes", Int64.Type},
        {"Qtd Emplacamentos", Int64.Type}})
in
    Tipos
```

Medidas sugeridas:

```dax
Hist Qtd Emplacamentos = SUM ( Hist_Emplac_Modelo[Qtd Emplacamentos] )
Hist Qtd Identificada  = CALCULATE ( [Hist Qtd Emplacamentos], Hist_Emplac_Modelo[Detalhamento] = "Modelo" )
Hist Qtd Varejo        = CALCULATE ( SUM ( Hist_Emplac_TipoVenda[Qtd Emplacamentos] ), Hist_Emplac_TipoVenda[Tipo de Venda] = "Varejo" )
Hist Qtd Direta        = CALCULATE ( SUM ( Hist_Emplac_TipoVenda[Qtd Emplacamentos] ), Hist_Emplac_TipoVenda[Tipo de Venda] = "Direta" )
```

Para comparar 2024 com 2025+ no mesmo visual, filtre `Categoria` em Automóveis + Comerciais Leves no modelo atual
e use `Fabricante`/`Modelo`/`Sub Segmento` como chave comum. Antes de emendar as séries, confira um mês de 2025 do
modelo atual contra o Informativo Fenabrave do mesmo mês para ver se os critérios batem.

## Reprocessar

```bash
scripts/baixar_pdfs.sh pdfs                          # ~265 PDFs, ~800 MB
python3 -I scripts/parse_fenabrave.py pdfs raw       # extrai os dados brutos
python3 -I scripts/build_base.py raw dados           # monta tabelas, residuais, Excel e conferência
```

Requer `pdftotext`/`pdfinfo` (poppler-utils) e Python com `pandas` e `openpyxl`.
