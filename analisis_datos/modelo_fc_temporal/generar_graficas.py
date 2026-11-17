"""Genera figuras agregadas de la evaluación temporal, sin datos individuales."""
import argparse
import json
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

MODELS = ['ritmo_historico', 'modelo_actual', 'rf_sin_fc_reentrenado', 'v3']
LABELS = ['Mediana reciente', 'Modelo web*', 'RF sin FC', 'RF V3']
COLORS = ['#778391', '#b47b38', '#426b9a', '#167d78']
plt.rcParams.update({'font.size': 11, 'axes.spines.top': False, 'axes.spines.right': False,
                     'axes.titleweight': 'bold', 'figure.facecolor': 'white', 'axes.facecolor': 'white'})


def finish(fig, path, note):
    fig.text(.04, .025, note, fontsize=9, color='#4b5563', ha='left', wrap=True)
    fig.tight_layout(rect=(0, .09, 1, 1))
    fig.savefig(path, dpi=180, bbox_inches='tight', facecolor='white')
    plt.close(fig)


def generate(report, out):
    out.mkdir(parents=True, exist_ok=True)
    test = report['results']['test']['models']
    n = report['partitions']['test']['activities']
    users = report['partitions']['test']['users']
    fig, ax = plt.subplots(figsize=(9, 4.7))
    values = [test[m]['mae_minutes'] for m in MODELS]
    bars = ax.barh(LABELS[::-1], values[::-1], color=COLORS[::-1], height=.6)
    ax.bar_label(bars, fmt='%.3f', padding=5)
    ax.set(xlim=(0, max(values)*1.22), xlabel='MAE (minutos; menor es mejor)', title='Prueba temporal: comparación de predictores')
    ax.grid(axis='x', alpha=.2); ax.set_axisbelow(True)
    finish(fig, out/'comparativa_global.png', f'{n:,} carreras · {users} deportistas. *Artefacto web: posible solapamiento con su entrenamiento.'.replace(',', '.'))

    fig, ax = plt.subplots(figsize=(9, 4.3))
    for y, (key, label) in enumerate([('test','Prueba'),('validation','Validación')]):
        d = report['results'][key]['v3_vs_rf_sin_fc']; v = d['delta_mae_minutes']*60; lo, hi = [x*60 for x in d['ci95_minutes']]
        ax.errorbar(v, y, xerr=[[v-lo],[hi-v]], fmt='o', color=COLORS[3], capsize=5, lw=2.3)
        ax.annotate(f'{v:+.2f} s  [{lo:+.2f}; {hi:+.2f}]', (v,y), xytext=(0,12), textcoords='offset points', ha='center', fontsize=10)
    ax.axvline(0, ls='--', color='#64748b'); ax.set_yticks([0,1], ['Prueba','Validación']); ax.set_ylim(-.5,1.65)
    ax.set(xlabel='Diferencia MAE (segundos): V3 − RF sin FC', title='Aporte de FC: estimación e incertidumbre (IC 95 %)')
    ax.grid(axis='x', alpha=.2)
    finish(fig, out/'intervalos_confianza.png', 'Bootstrap pareado por deportista. El intervalo de prueba incluye cero; la mejora no es concluyente.')

    seg = report['segments']['test']
    def grouped(filename, title, groups, note):
        fig, ax = plt.subplots(figsize=(9, max(4.1, .66*len(groups)+1.9)))
        labels=[]; a=[]; b=[]
        for key, code, label in groups:
            row=seg[key][code]; models=row.get('models')
            if not models:
                continue
            count=models['v3']['activities']; labels.append(f'{label} (n={count:,})'.replace(',', '.'))
            a.append(models[MODELS[2]]['mae_minutes']); b.append(models['v3']['mae_minutes'])
        y=np.arange(len(labels)); bars1=ax.barh(y+.18,a,.32,color=COLORS[2],label='RF sin FC'); bars2=ax.barh(y-.18,b,.32,color=COLORS[3],label='RF V3')
        ax.bar_label(bars1,fmt='%.2f',padding=3,fontsize=9); ax.bar_label(bars2,fmt='%.2f',padding=3,fontsize=9)
        ax.set_yticks(y,labels); ax.invert_yaxis(); ax.set_xlim(0,max(a+b)*1.25); ax.set_xlabel('MAE (minutos)'); ax.set_title(title, pad=34)
        ax.legend(loc='lower center', bbox_to_anchor=(.5, 1.005), ncol=2, frameon=False); ax.grid(axis='x',alpha=.2); ax.set_axisbelow(True)
        finish(fig,out/filename,note)
    grouped('error_distancia.png','Error por distancia de la carrera', [('distancia_km',k,l) for k,l in [('<=5','≤5 km'),('5-10','5–10 km'),('10-21.1','10–21,1 km'),('>21.1','>21,1 km')]], 'Prueba temporal. Comparación exploratoria; las carreras largas tienen mayor error absoluto.')
    grouped('error_desnivel.png','Error por desnivel de la ruta', [(k,c,f'{label} · {l}') for k,label in [('ascenso_m_km','Ascenso'),('descenso_m_km','Descenso')] for c,l in [('<=5','≤5 m/km'),('5-20','5–20 m/km'),('>20','>20 m/km')]], 'Prueba temporal. Subgrupos de ascenso y descenso se solapan; no deben sumarse.')
    grouped('error_historial.png','Error según historial y presencia en entrenamiento', [('historial','5-10','5–10 sesiones'),('historial','11-30','11–30 sesiones'),('historial','>30','>30 sesiones'),('usuario_en_train','si','Presente en train'),('usuario_en_train','no','Nuevo en train')], 'Prueba temporal. Historial y presencia en train son dimensiones distintas; subgrupos exploratorios.')
    grouped('error_cobertura_fc.png','Error según cobertura histórica de series FC', [('cobertura_series_fc','30-70%','30–70 %'),('cobertura_series_fc','>70%','>70 %')], 'Prueba temporal. Cobertura ≤30 % omitida: muestra insuficiente (92 carreras, 21 deportistas).')


if __name__ == '__main__':
    default = Path(__file__).resolve().parents[1]/'resultados_fc_temporal'
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--informe',type=Path,default=default/'informe_temporal.json')
    parser.add_argument('--salida',type=Path,default=default/'graficas')
    args=parser.parse_args()
    generate(json.loads(args.informe.read_text(encoding='utf-8-sig')),args.salida)
    print(f'Figuras generadas en {args.salida}')
