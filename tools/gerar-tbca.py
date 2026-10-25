# Gera js/modules/dieta/tbca.json a partir do arquivo "alimentos.txt"
# (raspagem pública da TBCA-USP: github.com/resen-dev/web-scraping-tbca).
# Uso: python3 tools/gerar-tbca.py caminho/alimentos.txt
import json, re, sys

ENTRADA = sys.argv[1]
SAIDA = 'js/modules/dieta/tbca.json'

CAMPOS = [  # (componente, unidade)
    ('Energia', 'kcal'), ('Proteína', 'g'), ('Carboidrato disponível', 'g'), ('Lipídios', 'g'),
    ('Fibra alimentar', 'g'), ('Sódio', 'mg'), ('Açúcar de adição', 'g'), ('Ácidos graxos saturados', 'g'),
]
GRUPOS_NOME = {'Pescados e frutos do mar': 'Pescados e Frutos do mar'}

# Nome científico no fim da descrição ("..., Oryza sativa L.") vira só ruído na lista
CIENTIFICO = re.compile(r"^[A-Z][a-z]+ (x |[a-z]+\.?|spp?\.)(\b|$)")
PT = {'Arroz', 'Feijão', 'Farinha', 'Carne', 'Leite', 'Queijo', 'Pão', 'Molho', 'Doce', 'Suco', 'Bolo', 'Creme'}

def limpar(desc):
    d = re.sub(r'\s+', ' ', desc).strip().rstrip(',').strip()
    partes = [p.strip() for p in d.split(',')]
    while len(partes) > 1 and CIENTIFICO.match(partes[-1]) and partes[-1].split()[0] not in PT and not re.search(r'[áéíóúãõâêôç]', partes[-1]):
        partes.pop()
    d = ', '.join(p for p in partes if p)
    # Lista de ingredientes no fim ("..., frito, (farinha, ovo...)") fica só na descrição completa
    if d.endswith(')'):
        nivel = 0
        for i in range(len(d) - 1, -1, -1):
            nivel += {')': 1, '(': -1}.get(d[i], 0)
            if nivel == 0:
                if d[:i].rstrip().endswith(','): d = d[:i].rstrip().rstrip(',').strip()
                break
    return d

def valor(v):
    v = (v or '').strip()
    if v == 'tr': return 0
    try: return round(float(v.replace(',', '.')), 2)
    except ValueError: return None

grupos, saida = [], []
for linha in open(ENTRADA, encoding='utf-8'):
    if not linha.strip(): continue
    a = json.loads(linha)
    nut = {(n['Componente'], n['Unidades']): valor(n['Valor por 100g']) for n in a['nutrientes']}
    g = GRUPOS_NOME.get(a['classe'], a['classe'])
    if g not in grupos: grupos.append(g)
    nome = limpar(a['descricao'])
    completo = re.sub(r'\s+', ' ', a['descricao']).strip().rstrip(',')
    saida.append([a['codigo'], nome, grupos.index(g)] + [nut.get(c) for c in CAMPOS] + ([completo] if completo != nome else []))

saida.sort(key=lambda x: x[1])
json.dump({'fonte': 'TBCA-USP', 'campos': ['codigo', 'nome', 'grupo', 'kcal', 'p', 'c', 'g', 'fibra', 'sodio', 'acucar', 'saturada', 'descricao'],
           'grupos': grupos, 'alimentos': saida}, open(SAIDA, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(len(saida), 'alimentos')
