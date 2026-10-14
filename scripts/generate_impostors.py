"""
Generate high-resolution botanical impostor textures with alpha transparency
for Brazilian biomes (Cerrado, Mata Estacional, Silvicultura, Pastagem, Campo Rupestre)
"""
import math
import random
from PIL import Image, ImageDraw, ImageFilter

random.seed(42)

def create_tropical_forest_tree(w=512, h=512):
    """Mata Estacional / Floresta Tropical (Classe 3): Árvore latifoliada com copa densa e exuberante"""
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    cx = w // 2
    base_y = int(h * 0.95)
    trunk_top_y = int(h * 0.45)
    
    # Tronco robusto e sapopembas
    trunk_color = (65, 48, 35, 255)
    trunk_hl = (95, 75, 55, 255)
    
    # Raízes na base
    draw.polygon([(cx - 45, base_y), (cx - 18, base_y - 60), (cx + 18, base_y - 60), (cx + 45, base_y)], fill=trunk_color)
    # Tronco principal
    draw.polygon([(cx - 22, base_y - 50), (cx - 12, trunk_top_y), (cx + 12, trunk_top_y), (cx + 22, base_y - 50)], fill=trunk_color)
    # Textura do tronco
    draw.line([(cx - 5, base_y), (cx - 3, trunk_top_y + 30)], fill=trunk_hl, width=4)
    draw.line([(cx + 4, base_y), (cx + 2, trunk_top_y + 40)], fill=(45, 30, 20, 255), width=3)
    
    # Galhos principais ascendentes
    branches = [
        ((cx - 10, trunk_top_y + 20), (cx - 80, int(h * 0.35)), 14),
        ((cx + 10, trunk_top_y + 20), (cx + 80, int(h * 0.34)), 14),
        ((cx - 5, trunk_top_y), (cx - 40, int(h * 0.22)), 12),
        ((cx + 5, trunk_top_y), (cx + 45, int(h * 0.23)), 12),
        ((cx, trunk_top_y), (cx, int(h * 0.18)), 12),
    ]
    for start, end, thick in branches:
        draw.line([start, end], fill=trunk_color, width=thick)

    # Copas densas em camadas (folhagem tropical)
    # Gera centenas de elipses e folhas com variações de verde esmeralda e floresta
    greens = [
        (18, 75, 38),   # Verde profundo base
        (26, 105, 52),  # Verde médio
        (35, 138, 68),  # Verde floresta vibrante
        (46, 168, 82),  # Verde viçoso
        (72, 195, 105), # Realce de luz solar
        (120, 210, 130) # Brilho pontual
    ]
    
    # Camadas de nuvens de folhagem
    clusters = [
        (cx, int(h * 0.18), 120, 80),
        (cx - 75, int(h * 0.32), 105, 75),
        (cx + 80, int(h * 0.30), 110, 80),
        (cx - 45, int(h * 0.22), 115, 80),
        (cx + 45, int(h * 0.24), 115, 80),
        (cx, int(h * 0.35), 140, 90),
        (cx - 100, int(h * 0.42), 85, 65),
        (cx + 100, int(h * 0.40), 90, 70),
    ]
    
    for ccx, ccy, rx, ry in clusters:
        # Sombra sob cada tufo
        draw.ellipse([ccx - rx, ccy - ry + 15, ccx + rx, ccy + ry + 15], fill=(12, 45, 22, 230))
        # Volume central
        for _ in range(35):
            ox = random.gauss(0, rx * 0.45)
            oy = random.gauss(0, ry * 0.45)
            s_rx = random.randint(18, 38)
            s_ry = random.randint(14, 30)
            col = random.choice(greens[:4])
            alpha = random.randint(220, 255)
            draw.ellipse([ccx + ox - s_rx, ccy + oy - s_ry, ccx + ox + s_rx, ccy + oy + s_ry], fill=(col[0], col[1], col[2], alpha))
            
        # Realces de folhas no topo iluminado
        for _ in range(25):
            ox = random.gauss(0, rx * 0.4)
            oy = random.gauss(-ry * 0.25, ry * 0.3)
            s_r = random.randint(10, 22)
            col = random.choice(greens[3:])
            draw.ellipse([ccx + ox - s_r, ccy + oy - s_r, ccx + ox + s_r, ccy + oy + s_r], fill=(col[0], col[1], col[2], 240))
            
    return img

def create_cerrado_tree(w=512, h=512):
    """Árvore do Cerrado (Classe 4): Tronco tortuoso, casca corticosa rugosa, galhos angulosos, copa aberta assimétrica"""
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    cx = w // 2
    base_y = int(h * 0.95)
    
    # Tronco gnarled / tortuoso característico do Cerrado
    cork_dark = (58, 42, 30, 255)
    cork_mid = (92, 70, 50, 255)
    cork_light = (130, 105, 78, 255)
    
    # Segmentos tortuosos do tronco principal
    p0 = (cx, base_y)
    p1 = (cx - 28, int(h * 0.82))
    p2 = (cx - 15, int(h * 0.70))
    p3 = (cx + 35, int(h * 0.58))
    p4 = (cx + 20, int(h * 0.48))
    
    pts = [p0, p1, p2, p3, p4]
    for i in range(len(pts) - 1):
        draw.line([pts[i], pts[i+1]], fill=cork_dark, width=28 - i * 3)
        # Fissuras de casca grossa corticosa
        draw.line([pts[i], pts[i+1]], fill=cork_mid, width=22 - i * 3)
        draw.line([(pts[i][0] + 3, pts[i][1]), (pts[i+1][0] + 3, pts[i+1][1])], fill=cork_light, width=6)

    # Galhos retorcidos angulosos (característica marcante do Cerrado sensu stricto)
    branches = [
        # Galho torto para esquerda
        [p3, (cx - 60, int(h * 0.52)), (cx - 130, int(h * 0.44)), (cx - 160, int(h * 0.38))],
        # Galho torto bifurcado esquerda
        [(cx - 60, int(h * 0.52)), (cx - 90, int(h * 0.36)), (cx - 100, int(h * 0.28))],
        # Galho torto para direita
        [p4, (cx + 80, int(h * 0.42)), (cx + 140, int(h * 0.38)), (cx + 175, int(h * 0.34))],
        # Galho central ascendente quebrado
        [p4, (cx - 10, int(h * 0.38)), (cx + 25, int(h * 0.28)), (cx + 15, int(h * 0.20))],
        # Galho lateral baixo
        [p2, (cx - 70, int(h * 0.65)), (cx - 110, int(h * 0.60))]
    ]
    
    for b in branches:
        for i in range(len(b) - 1):
            w_line = max(5, 14 - i * 3)
            draw.line([b[i], b[i+1]], fill=cork_dark, width=w_line)
            draw.line([b[i], b[i+1]], fill=cork_mid, width=max(3, w_line - 3))
            
    # Folhagem coriácea em tufos abertos (verde-oliva, verde-cerrado, com folhas visíveis)
    cerrado_greens = [
        (45, 68, 28),   # Verde oliva escuro
        (75, 108, 42),  # Verde cerrado clássico
        (108, 145, 58), # Verde oliva vibrante
        (138, 175, 75), # Folha nova verde-clara
        (165, 155, 60), # Tons amarelados/secos típicos da estação seca
    ]
    
    leaf_clusters = [
        (cx - 160, int(h * 0.36), 65, 45),
        (cx - 100, int(h * 0.27), 75, 50),
        (cx - 50, int(h * 0.32), 60, 42),
        (cx + 15, int(h * 0.19), 80, 52),
        (cx + 90, int(h * 0.26), 70, 48),
        (cx + 160, int(h * 0.33), 65, 45),
        (cx + 120, int(h * 0.40), 55, 38),
        (cx - 105, int(h * 0.58), 45, 32), # tufo baixo
    ]
    
    for ccx, ccy, rx, ry in leaf_clusters:
        for _ in range(25):
            ox = random.gauss(0, rx * 0.4)
            oy = random.gauss(0, ry * 0.4)
            s_rx = random.randint(12, 26)
            s_ry = random.randint(9, 20)
            col = random.choice(cerrado_greens[:4])
            draw.ellipse([ccx + ox - s_rx, ccy + oy - s_ry, ccx + ox + s_rx, ccy + oy + s_ry], fill=(col[0], col[1], col[2], 235))
            
        # Toques de folhas coriáceas claras e amareladas
        for _ in range(12):
            ox = random.gauss(0, rx * 0.35)
            oy = random.gauss(-ry * 0.2, ry * 0.25)
            s_r = random.randint(7, 15)
            col = random.choice(cerrado_greens[2:])
            draw.ellipse([ccx + ox - s_r, ccy + oy - s_r, ccx + ox + s_r, ccy + oy + s_r], fill=(col[0], col[1], col[2], 245))
            
    return img

def create_cerrado_shrub(w=512, h=512):
    """Arbusto de Cerrado (Classe 4 - Formação Savânica aberta): Multicaules, porte baixo a médio, ramos lenhosos densos"""
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    cx = w // 2
    base_y = int(h * 0.95)
    
    stem_color = (68, 52, 38, 255)
    stem_hl = (105, 85, 65, 255)
    
    # Múltiplos caules divergindo da base
    stems = [
        [(cx, base_y), (cx - 70, int(h * 0.70)), (cx - 120, int(h * 0.48))],
        [(cx, base_y), (cx - 30, int(h * 0.65)), (cx - 50, int(h * 0.40))],
        [(cx, base_y), (cx + 20, int(h * 0.62)), (cx + 40, int(h * 0.38))],
        [(cx, base_y), (cx + 60, int(h * 0.68)), (cx + 115, int(h * 0.45))],
        [(cx - 10, base_y), (cx, int(h * 0.55)), (cx - 10, int(h * 0.32))],
    ]
    for s in stems:
        for i in range(len(s) - 1):
            draw.line([s[i], s[i+1]], fill=stem_color, width=max(4, 12 - i * 3))
            draw.line([s[i], s[i+1]], fill=stem_hl, width=max(2, 6 - i * 2))
            
    # Copa arbustiva arredondada densa
    greens = [
        (38, 58, 25),
        (65, 95, 36),
        (92, 130, 52),
        (125, 162, 68),
        (152, 142, 62)
    ]
    
    for _ in range(90):
        ox = random.gauss(0, 95)
        oy = random.gauss(0, 70)
        s_y = int(h * 0.52) + oy
        s_x = cx + ox
        if s_y > base_y - 20: continue
        r = random.randint(16, 36)
        col = random.choice(greens)
        draw.ellipse([s_x - r, s_y - r * 0.8, s_x + r, s_y + r * 0.8], fill=(col[0], col[1], col[2], 230))
        
    return img

def create_eucalyptus_tree(w=512, h=512):
    """Silvicultura (Classe 9): Eucalipto (tronco alto, reto e esbranquiçado, copa esguia com folhagem pendular)"""
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    cx = w // 2
    base_y = int(h * 0.98)
    trunk_top_y = int(h * 0.12)
    
    # Tronco esbelto, reto e caracteristicamente esbranquiçado com manchas acinzentadas/amareladas de desfolha
    # Tronco vai de base_y até bem perto do topo
    trunk_pts = [(cx - 9, base_y), (cx - 4, trunk_top_y), (cx + 4, trunk_top_y), (cx + 9, base_y)]
    draw.polygon(trunk_pts, fill=(215, 218, 212, 255))
    
    # Manchas de casca de eucalipto (peeling bark)
    bark_colors = [(165, 155, 142, 255), (120, 110, 95, 255), (240, 242, 238, 255), (145, 125, 105, 255)]
    for _ in range(35):
        by = random.randint(int(h * 0.25), base_y - 10)
        bw = random.randint(2, 6)
        bh = random.randint(15, 45)
        col = random.choice(bark_colors)
        draw.rectangle([cx - bw, by, cx + bw, by + bh], fill=col)

    # Galhos curtos saindo da parte média/alta para os lados
    euc_greens = [
        (48, 85, 62),   # Verde azulado escuro
        (65, 115, 82),  # Verde eucalipto
        (92, 145, 108), # Verde azulado claro
        (120, 175, 132),# Broto jovem
        (135, 155, 110) # Tom seco
    ]
    
    for gy in range(int(h * 0.15), int(h * 0.65), 18):
        # galho para esquerda
        len_l = random.randint(35, 75)
        draw.line([(cx, gy), (cx - len_l, gy + 12)], fill=(150, 140, 130, 255), width=3)
        # galho para direita
        len_r = random.randint(35, 75)
        draw.line([(cx, gy), (cx + len_r, gy + 12)], fill=(150, 140, 130, 255), width=3)
        
        # Folhagem pendular típica de Eucalyptus
        for lx in [cx - len_l, cx + len_r, cx + random.randint(-20, 20)]:
            for _ in range(6):
                ox = random.gauss(0, 12)
                oy = random.randint(0, 28) # pende para baixo
                col = random.choice(euc_greens)
                draw.ellipse([lx + ox - 8, gy + oy - 14, lx + ox + 8, gy + oy + 14], fill=(col[0], col[1], col[2], 225))
                
    # Copa de topo esguia
    for _ in range(40):
        ox = random.gauss(0, 24)
        oy = random.gauss(0, 45)
        col = random.choice(euc_greens)
        draw.ellipse([cx + ox - 12, int(h * 0.22) + oy - 16, cx + ox + 12, int(h * 0.22) + oy + 16], fill=(col[0], col[1], col[2], 235))
        
    return img

def create_pasture_grass(w=512, h=512):
    """Pastagem (Classe 15 & 21): Tufo de Capim Braquiária (Brachiaria decumbens/brizantha)"""
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    cx = w // 2
    base_y = int(h * 0.95)
    
    grass_shades = [
        (85, 125, 42),   # Verde oliva pasto
        (115, 165, 52),  # Verde grama clássico
        (145, 195, 68),  # Verde broto vibrante
        (185, 198, 75),  # Verde amarelado / sol
        (195, 180, 85),  # Capim seco / dourado
        (165, 140, 65),  # Palha na base
    ]
    
    # Desenha 120 lâminas arqueadas radiando do centro da base formando um tufo volumoso
    for _ in range(140):
        # Ângulo de curvatura
        angle = random.uniform(-math.pi * 0.82, -math.pi * 0.18)
        radius = random.uniform(h * 0.45, h * 0.88)
        
        # Ponto final
        ex = cx + radius * math.cos(angle)
        ey = base_y + radius * math.sin(angle)
        
        # Curvatura por ponto de controle bezier
        ctrl_x = cx + (ex - cx) * random.uniform(0.3, 0.7) + random.uniform(-30, 30)
        ctrl_y = base_y - radius * random.uniform(0.6, 1.1)
        
        col = random.choice(grass_shades)
        thickness = random.randint(3, 7)
        
        # Amostragem da curva quadrática
        steps = 15
        curve_pts = []
        for t_step in range(steps + 1):
            t = t_step / steps
            px = (1 - t)**2 * cx + 2 * (1 - t) * t * ctrl_x + t**2 * ex
            py = (1 - t)**2 * base_y + 2 * (1 - t) * t * ctrl_y + t**2 * ey
            curve_pts.append((px, py))
            
        for i in range(len(curve_pts) - 1):
            w_line = max(1, int(thickness * (1.0 - i / len(curve_pts) * 0.75)))
            draw.line([curve_pts[i], curve_pts[i+1]], fill=(col[0], col[1], col[2], 240), width=w_line)
            
    # Base densa de palha e colmos
    for _ in range(40):
        bx = cx + random.randint(-45, 45)
        by = base_y - random.randint(10, 50)
        draw.ellipse([bx - 12, by - 12, bx + 12, by + 12], fill=(95, 135, 48, 220))
        
    return img

def create_rupestre_rock_and_vegetation(w=512, h=512):
    """Afloramento Rochoso (Classe 29): Blocos de Quartzito da Serra Dourada com Gramíneas Nativas e Canela-de-ema"""
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    cx = w // 2
    base_y = int(h * 0.95)
    
    # Rochas de quartzito: blocos angulares fraturados em camadas (tons ocres, dourados, terracota e líquens)
    rock_dark = (115, 80, 52, 255)
    rock_mid = (168, 125, 82, 255)
    rock_light = (212, 172, 118, 255)
    rock_gold = (235, 195, 130, 255)
    lichen_green = (145, 155, 95, 230)
    
    # Bloco principal de quartzito (angulado)
    poly_main = [
        (cx - 160, base_y),
        (cx - 140, int(h * 0.55)),
        (cx - 60, int(h * 0.35)),
        (cx + 40, int(h * 0.32)),
        (cx + 150, int(h * 0.48)),
        (cx + 175, base_y)
    ]
    draw.polygon(poly_main, fill=rock_mid)
    
    # Facetas de fratura e relevo rochoso
    facet1 = [(cx - 140, int(h * 0.55)), (cx - 60, int(h * 0.35)), (cx - 10, int(h * 0.55)), (cx - 80, base_y), (cx - 160, base_y)]
    draw.polygon(facet1, fill=rock_light)
    
    facet2 = [(cx - 60, int(h * 0.35)), (cx + 40, int(h * 0.32)), (cx + 70, int(h * 0.50)), (cx - 10, int(h * 0.55))]
    draw.polygon(facet2, fill=rock_gold)
    
    facet3 = [(cx + 40, int(h * 0.32)), (cx + 150, int(h * 0.48)), (cx + 175, base_y), (cx + 50, base_y), (cx + 70, int(h * 0.50))]
    draw.polygon(facet3, fill=rock_dark)
    
    # Linhas de fratura geológica de quartzito
    fractures = [
        ((cx - 60, int(h * 0.35)), (cx - 10, int(h * 0.55))),
        ((cx - 10, int(h * 0.55)), (cx - 80, base_y)),
        ((cx + 40, int(h * 0.32)), (cx + 70, int(h * 0.50))),
        ((cx + 70, int(h * 0.50)), (cx + 50, base_y)),
        ((cx - 120, int(h * 0.65)), (cx + 120, int(h * 0.58))),
    ]
    for p1, p2 in fractures:
        draw.line([p1, p2], fill=(65, 42, 25, 255), width=4)
        
    # Líquens crustosos sobre o quartzito
    for _ in range(45):
        lx = cx + random.randint(-120, 120)
        ly = random.randint(int(h * 0.40), base_y - 20)
        lr = random.randint(6, 18)
        draw.ellipse([lx - lr, ly - lr * 0.6, lx + lr, ly + lr * 0.6], fill=lichen_green)

    # Vegetação Rupestre nativa nas frestas (Vellozia / Canela-de-ema e tufos de capim rupestre)
    # Canela-de-ema no topo da rocha (haste lenhosa com roseta espiralada de folhas finas)
    vellozia_stem_base = (cx - 30, int(h * 0.42))
    vellozia_stem_top = (cx - 45, int(h * 0.22))
    draw.line([vellozia_stem_base, vellozia_stem_top], fill=(55, 45, 35, 255), width=8)
    
    # Roseta de folhas rígidas da Vellozia
    v_greens = [(75, 115, 52), (105, 145, 68), (145, 135, 58), (168, 95, 135)] # tons incluindo flores arroxeadas
    for _ in range(40):
        v_angle = random.uniform(-math.pi * 0.95, -math.pi * 0.05)
        v_len = random.uniform(30, 75)
        vx = vellozia_stem_top[0] + v_len * math.cos(v_angle)
        vy = vellozia_stem_top[1] + v_len * math.sin(v_angle) * 0.8
        v_col = random.choice(v_greens)
        draw.line([vellozia_stem_top, (vx, vy)], fill=(v_col[0], v_col[1], v_col[2], 240), width=3)
        
    # Flor arroxeada no ápice da canela-de-ema
    draw.ellipse([vellozia_stem_top[0] - 8, vellozia_stem_top[1] - 8, vellozia_stem_top[0] + 8, vellozia_stem_top[1] + 8], fill=(185, 120, 215, 255))
        
    # Tufos de gramíneas rupestres saindo das frestas inferiores e laterais
    for start_x, start_y in [(cx + 60, int(h * 0.60)), (cx - 110, int(h * 0.75)), (cx + 120, int(h * 0.72))]:
        for _ in range(25):
            g_ang = random.uniform(-math.pi * 0.85, -math.pi * 0.15)
            g_len = random.uniform(25, 60)
            gx = start_x + g_len * math.cos(g_ang)
            gy = start_y + g_len * math.sin(g_ang)
            g_col = random.choice([(115, 155, 58), (155, 175, 72), (185, 165, 82)])
            draw.line([(start_x, start_y), (gx, gy)], fill=(g_col[0], g_col[1], g_col[2], 240), width=2)
            
    return img

def create_native_grassland(w=512, h=512):
    """Formação Campestre (Classe 12): Gramíneas Nativas do Cerrado com Plumas Douradas (Aristida)"""
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    cx = w // 2
    base_y = int(h * 0.95)
    
    shades = [
        (135, 165, 65),
        (175, 185, 75),
        (215, 195, 95),  # Dourado palha
        (235, 215, 135), # Plumas de sementes claras
        (185, 155, 85)
    ]
    
    # Hastes longas e esguias típicas de campo limpo
    for _ in range(80):
        angle = random.uniform(-math.pi * 0.75, -math.pi * 0.25)
        length = random.uniform(h * 0.55, h * 0.92)
        ex = cx + length * math.cos(angle)
        ey = base_y + length * math.sin(angle)
        
        col = random.choice(shades)
        draw.line([(cx + random.randint(-15, 15), base_y), (ex, ey)], fill=(col[0], col[1], col[2], 220), width=2)
        
        # Pluma de sementes no terço superior
        for step in range(8):
            t = 0.7 + step * 0.04
            px = cx + (ex - cx) * t
            py = base_y + (ey - base_y) * t
            p_col = random.choice(shades[2:])
            draw.ellipse([px - 4, py - 3, px + 4, py + 3], fill=(p_col[0], p_col[1], p_col[2], 230))
            
    return img

def main():
    import os
    out_dir = "/mnt/e/TrabalhosLAPIG/MapBiomas3D/web/public/impostors"
    os.makedirs(out_dir, exist_ok=True)
    
    print("Generating Brazilian Botanical Impostors...")
    
    tex_tropical = create_tropical_forest_tree()
    tex_tropical.save(os.path.join(out_dir, "tree_tropical.png"), "PNG")
    print("✓ tree_tropical.png (Formação Florestal - Classe 3)")
    
    tex_cerrado = create_cerrado_tree()
    tex_cerrado.save(os.path.join(out_dir, "tree_cerrado.png"), "PNG")
    print("✓ tree_cerrado.png (Formação Savânica / Cerrado - Classe 4)")
    
    tex_shrub = create_cerrado_shrub()
    tex_shrub.save(os.path.join(out_dir, "shrub_cerrado.png"), "PNG")
    print("✓ shrub_cerrado.png (Arbustos do Cerrado - Classe 4)")
    
    tex_euc = create_eucalyptus_tree()
    tex_euc.save(os.path.join(out_dir, "tree_eucalyptus.png"), "PNG")
    print("✓ tree_eucalyptus.png (Silvicultura / Eucalipto - Classe 9)")
    
    tex_pasture = create_pasture_grass()
    tex_pasture.save(os.path.join(out_dir, "grass_pasture.png"), "PNG")
    print("✓ grass_pasture.png (Pastagem / Braquiária - Classe 15)")
    
    tex_rupestre = create_rupestre_rock_and_vegetation()
    tex_rupestre.save(os.path.join(out_dir, "rock_rupestre.png"), "PNG")
    print("✓ rock_rupestre.png (Afloramento Rochoso com Vellozia - Classe 29)")
    
    tex_campestre = create_native_grassland()
    tex_campestre.save(os.path.join(out_dir, "grass_native.png"), "PNG")
    print("✓ grass_native.png (Formação Campestre - Classe 12)")

if __name__ == "__main__":
    main()
