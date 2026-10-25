# Gera js/modules/dieta/tabelas.json com duas tabelas públicas brasileiras,
# usadas na busca junto com a TBCA:
#  - TACO 4ª ed. (NEPA/UNICAMP), CSVs de github.com/raulfdm/taco-api (references/csv)
#  - IBGE POF 2008-2009, "Tabela de composição nutricional dos alimentos consumidos
#    no Brasil" (alimentos já preparados), SQL de github.com/renandspedrosa/tabela-taco-api
# Uso: python3 tools/gerar-tabelas.py pasta/taco-api/references/csv caminho/ibge.sql
import csv, json, re, sys

TACO_CSV, IBGE_SQL = sys.argv[1], sys.argv[2]
SAIDA = 'js/modules/dieta/tabelas.json'

grupos, idx_grupo = [], {}
def grupo(nome):
    if nome not in idx_grupo:
        idx_grupo[nome] = len(grupos)
        grupos.append(nome)
    return idx_grupo[nome]

def num(v):
    v = (v or '').strip().replace(',', '.')
    try:
        return round(float(v), 2)
    except ValueError:
        return None

def ler(nome):
    with open(f'{TACO_CSV}/{nome}', encoding='utf8') as f:
        return list(csv.DictReader(f))

# ---------- TACO ----------
cats = {c['id']: c['name'] for c in ler('categories.csv')}
nut = {n['foodId']: n for n in ler('nutrients.csv')}
taco = []
for f in ler('food.csv'):
    n = nut.get(f['id'])
    if not n or num(n['kcal']) is None:
        continue
    # [ref, nome, grupo, kcal, p, c, g, fibra, sodio]  (c = carboidrato total)
    taco.append([f['id'], f['name'].strip(), grupo(cats[f['categoryId']]), num(n['kcal']), num(n['protein']),
                 num(n['carbohydrates']), num(n['lipids']), num(n['dietaryFiber']), num(n['sodium'])])

# ---------- IBGE ----------
PREPARO = {  # o resto vira minúsculo: "Cozido(a)" -> "cozido(a)"
    'Grelhado(a)/brasa/churrasco': 'grelhado(a)/churrasco', 'Molho vermelho': 'ao molho vermelho',
    'Molho branco': 'ao molho branco', 'Sopa': 'em sopa', 'Mingau': 'em mingau',
}
sql = open(IBGE_SQL, encoding='utf8').read().split('VALUES', 1)[1]
ibge = []
for m in re.finditer(r"\(\s*((?:'(?:[^'\\]|\\.|'')*'|NULL|[-\d.]+|\s|,)+)\)", sql):
    r = [a or b or c for a, b, c in re.findall(r"'((?:[^'\\]|\\.|'')*)'|(NULL)|([-\d.]+)", m.group(1))]
    codigo, desc, cat, cod_prep, prep = r[:5]
    kcal = num(r[5])
    if kcal is None:
        continue
    nome = desc.strip()
    if prep != 'Não se aplica':
        nome += ', ' + PREPARO.get(prep, prep.lower())
    sod = [num(r[24]), num(r[25])]  # sódio do alimento + sódio de adição (sal do preparo)
    sodio = round(sum(s for s in sod if s is not None), 2) if any(s is not None for s in sod) else None
    # [ref, nome, grupo, kcal, p, c, g, fibra, sodio, acucar_adicao, saturada]
    ibge.append([f'{codigo}-{cod_prep if cod_prep != "NULL" else 0}', nome, grupo(cat), kcal, num(r[6]), num(r[8]),
                 num(r[7]), num(r[9]), sodio, num(r[18]), num(r[11])])

with open(SAIDA, 'w', encoding='utf8') as f:
    json.dump({'grupos': grupos, 'taco': taco, 'ibge': ibge}, f, ensure_ascii=False, separators=(',', ':'))
print(f'{SAIDA}: TACO {len(taco)}, IBGE {len(ibge)}, {len(grupos)} grupos')
