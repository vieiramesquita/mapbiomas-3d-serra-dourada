# 🛰️ MapBiomas 3D - Parque Estadual da Serra Dourada (Goiás, Brasil)

[![GitHub Pages](https://img.shields.io/badge/Deploy-GitHub%20Pages-success?style=for-the-badge&logo=github)](https://pages.github.com/)
[![MapBiomas Col. 11](https://img.shields.io/badge/MapBiomas-Coleção%2011%20(2025)-1f8d49?style=for-the-badge)](https://mapbiomas.org/)
[![DEM Copernicus](https://img.shields.io/badge/DEM-Copernicus%20GLO--30-3b82f6?style=for-the-badge)](https://spacedata.copernicus.eu/)
[![Three.js](https://img.shields.io/badge/Three.js-r128%20WebGL-black?style=for-the-badge&logo=three.js)](https://threejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)

Aplicação web geoespacial interativa em **3D/WebGL** que transforma dados de cobertura e uso da terra do **MapBiomas Coleção 11 (2025)** e o relevo digital do **DEM Copernicus (30m)** em um gêmeo digital volumétrico e fotorrealista da região do **Parque Estadual da Serra Dourada** e do município histórico de **Goiás Velho (GO)**.

---

## 🌐 Demonstração Online (Live Demo)
Acesse a aplicação diretamente no navegador (computador ou smartphone, sem necessidade de instalação):
> 👉 **[https://vieiramesquita.github.io/mapbiomas-3d-serra-dourada/](https://vieiramesquita.github.io/mapbiomas-3d-serra-dourada/)**

---

## ✨ Principais Funcionalidades

- **🏔️ Relevo Real Calibrado em Escala 1:1:**
  - Modelo Digital de Elevação (DEM) Copernicus GLO-30 calibrado metricamente: desnível real de 699 metros (altitudes de 360m a 1.060m).
  - Interpolação bilinear contínua na GPU para eliminação de artefatos em degrau.
  - Controle dinâmico de exagero vertical (0.2x a 4.0x) e botão de restauração para escala física 1:1.

- **🌿 Distribuição Botânica e Props 3D Procedurais (+1,2 milhão de instâncias):**
  - Renderização via `THREE.InstancedMesh` com materiais PBR sólidos e vertex colors (mantendo 60 FPS estáveis).
  - **Mata Tropical & Galeria (1.1):** dosséis volumétricos multi-camadas nos vales e encostas.
  - **Cerrado & Arbustos (1.3):** árvores tortuosas e moitas savânicas nativas.
  - **Campos Rupestres & Quartzito (2.7):** escarpas e blocos geológicos com flora endêmica (*Vellozia*).
  - **Veredas de Buriti (2.3):** palmeiras de buriti e solos hidromórficos de nascentes.
  - **Pastagens de Braquiária (3.1) & Campos Nativos (2.1):** tufos volumétricos densificados.

- **🚜 Lavouras em Linhas Reais de Plantio & Maquinário:**
  - **Soja (3.2.1.1) & Milho/Lavouras Temporárias (3.2.1.5):** fileiras paralelas contínuas de semeadura orientadas conforme o talhão agrícola.
  - **Silvicultura de Eucalipto (3.3):** talhões florestais geométricos com ruas e corredores operacionais.
  - **Maquinário em Operação:** tratores agrícolas (verdes/vermelhos) e colheitadeiras Draper alinhados aos sulcos.
  - **Fauna nas Pastagens:** rebanhos de gado Nelore, Girolando, malhados e cavalos nos piquetes.

- **🏛️ Núcleo Histórico de Goiás Velho:**
  - Casario colonial fiel (casas térreas coloridas e sobrados bicentenários com sacadas em madeira).
  - Adro monumental com a Igreja Barroca de pedra, cruzeiro e lampiões coloniais.

- **🎛️ Controles Dinâmicos e Ferramentas Analíticas:**
  - **Controle de Densidade de Vegetação (+ props/px):** 4 níveis com escalonamento espacial ($1.0\times$ Padrão com ~530k props até $2.5\times$ Ultra com ~1,28 milhão de props).
  - **Resolução de Satélite Dinâmica:** suporte a texturas de alta definição em 4K (4.096px), 8K (8.192px) e 12K Ultra (12.288px).
  - **Alternância de Camadas:** Satélite, MapBiomas puro, Sobreposição translúcida com controle de opacidade e Mapa Hipsométrico.
  - **Simulador Solar e Neblina Fisiográfica:** ajuste de azimute e elevação solar para estudo de sombras e relevo.
  - **Estatísticas Territoriais:** painel analítico e modal completo com balanço de área por macrogrupos, tabela de classes e exportação em CSV.
  - **Ocultação de Menus:** modo cinema/panorâmico com interface minimizável.

---

## 🏗️ Arquitetura e Tecnologias

A aplicação foi desenvolvida com foco em **desempenho extremo**, **estética rica** e **zero dependências de backend**:

- **Frontend Core:** HTML5 semântico, Vanilla JavaScript (ES6+), Vanilla CSS moderno (Glassmorphism, Dark UI, responsivo).
- **Engine 3D:** [Three.js](https://threejs.org/) (r128) + `OrbitControls`, `BufferGeometryUtils`, `Sky` shader.
- **Otimização de Renderização:**
  - Instanciação em massa (`THREE.InstancedMesh`) agrupando centenas de milhares de elementos em ~25 draw-calls.
  - Descarte seguro de geometrias em VRAM ao alterar configurações.
  - Buffers binários ultraleves (`elevation.bin` e `classes.bin`) para carregamento instantâneo.
- **Hospedagem:** 100% estática, compatível nativamente com **GitHub Pages**, Vercel, Netlify ou qualquer servidor web estático.

---

## 📊 Fontes de Dados e Metadados Geográficos

| Dado | Fonte | Resolução | CRS / Projeção |
|:---|:---|:---:|:---:|
| **Uso e Cobertura da Terra** | MapBiomas Brasil (Coleção 11 - 2025) | 30 metros | EPSG:31982 (SIRGAS 2000 / UTM 22S) |
| **Modelo Digital de Elevação** | Copernicus DEM (GLO-30) | 30 metros | EPSG:31982 (SIRGAS 2000 / UTM 22S) |
| **Mosaico de Imagens de Satélite** | PlanetScope / Sentinel-2 | 4K, 8K e 12K | EPSG:31982 (SIRGAS 2000 / UTM 22S) |
| **Delimitação Territorial** | LAPIG / UFG & IBGE | Vetorial | SIRGAS 2000 |

- **Área Total Mapeada:** 124.637,4 hectares (~1.246,4 km²)
- **Matriz da Grade:** 1.650 colunas × 847 linhas (1.397.550 células de 30m)
- **Desnível:** 699 metros (Altitude mínima: 361m • Altitude máxima: 1.060m)

---

## 💻 Como Executar Localmente

Como a aplicação é totalmente estática, basta servir a pasta `web/` com qualquer servidor HTTP local:

### Com Node.js (Recomendado):
```bash
# Clone o repositório
git clone https://github.com/vieiramesquita/mapbiomas-3d-serra-dourada.git
cd mapbiomas-3d-serra-dourada

# Inicie o servidor estático nativo do projeto
node scripts/server.mjs
```
Ou usando `npx serve`:
```bash
npx serve web -p 8080
```

Abra `http://localhost:8080/` no seu navegador.

---

## 🚀 Como Publicar no GitHub Pages

Este repositório já inclui o fluxo pronto de deploy automático em [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml):

1. Envie as atualizações para o GitHub:
   ```bash
   git push -u origin main
   ```
2. No GitHub, acesse **Settings** ⚙️ > **Pages**.
3. Em **Build and deployment > Source**, selecione **GitHub Actions**.
4. Em instantes o site estará no ar em: [https://vieiramesquita.github.io/mapbiomas-3d-serra-dourada/](https://vieiramesquita.github.io/mapbiomas-3d-serra-dourada/)

---

## 📜 Licença

Distribuído sob a licença MIT. Consulte `LICENSE` para mais informações.

Dados de uso e cobertura pertencem à rede **[MapBiomas](https://mapbiomas.org/)** sob licença Creative Commons CC BY-SA 4.0.
Dados de elevação cortesia da **European Space Agency (ESA) / Copernicus Programme**.
Desenvolvido em colaboração com o **LAPIG (Laboratório de Processamento de Imagens e Geoprocessamento - UFG)**.
