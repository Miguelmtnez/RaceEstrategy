import {useEffect,useState} from 'react';
import {Activity,Bike,Footprints,Mountain,ShieldCheck,TrendingUp} from 'lucide-react';
import {api} from '../lib/api';

type Sport='Carrera'|'Bicicleta'|'MTB'|'Senderismo';
type Attr='resistencia'|'velocidad'|'desnivel'|'constancia';
type Rating={sport:Sport;score:number|null;attributes:Record<Attr,number|null>;activities:number;historyDays:number;
  status:string;confidence:string;strengths:string[];development:string[];provenance:string;
  referenceUsers:Record<Attr,number>|null;raw:{resistanceP75Km:number|null;medianSpeedKmh:number|null;ascentP75Per10Km:number|null;
    regularity:number|null;activeWeeks12:number|null;sessions12:number|null;longestKm?:number|null;sessionsAtLeast10Km?:number;sessionsAtLeast20Km?:number};methodology:string};
const sports:Sport[]=['Carrera','Bicicleta','MTB','Senderismo'];
const attrs:{key:Attr;label:string;detail:string}[]=[
  {key:'resistencia',label:'Resistencia*',detail:'Percentil de la distancia P75. NO mide tu límite físico ni tus marcas largas.'},
  {key:'velocidad',label:'Velocidad',detail:'Velocidad mediana registrada'},
  {key:'desnivel',label:'Desnivel',detail:'Exposición a ascenso por 10 km'},
  {key:'constancia',label:'Constancia',detail:'Regularidad en las últimas 12 semanas del historial'},
];
const names:Record<Attr,string>={resistencia:'resistencia',velocidad:'velocidad',desnivel:'exposición al desnivel',constancia:'constancia'};
const formatted=(v:number|null,units='')=>v==null?'Sin datos':`${new Intl.NumberFormat('es-ES',{maximumFractionDigits:1}).format(v)}${units}`;
function SportIcon({sport}:{sport:Sport}){return sport==='Carrera'?<Footprints size={16}/>:sport==='Senderismo'?<Mountain size={16}/>:<Bike size={16}/>;}
export default function SportsRatingCard(){
  const [sport,setSport]=useState<Sport>('Carrera');
  const [rating,setRating]=useState<Rating|null>(null);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);
  useEffect(()=>{
    let alive=true;setLoading(true);setError('');setRating(null);
    api<Rating>(`/ml/rating?sport=${encodeURIComponent(sport)}`)
      .then(r=>{if(alive)setRating(r)})
      .catch(e=>{if(alive)setError(e instanceof Error?e.message:'No se pudo obtener el rating.')})
      .finally(()=>{if(alive)setLoading(false)});
    return ()=>{alive=false};
  },[sport]);
  return <section className="data-panel rs-fifa-card" aria-label="Ficha de rendimiento tipo FIFA">
    <div className="rs-fifa-header"><div><span className="eyebrow">RACESTRATEGY RATING · FICHA DEPORTIVA</span><h3>Tu perfil tipo FIFA</h3>
      <p>Puntuaciones sobre todas tus actividades aportadas manualmente en Mis actividades o el Laboratorio IA, incluidas las que hayas desmarcado para predicciones. La API de Strava no se utiliza para estas puntuaciones.</p></div>
      <span className="rs-fifa-symbol"><Activity size={28}/></span></div>
    <div className="rs-fifa-tabs" role="group" aria-label="Modalidad para las puntuaciones">
      {sports.map(x=><button key={x} type="button" className={sport===x?'active':''} onClick={()=>setSport(x)}><SportIcon sport={x}/>{x}</button>)}
    </div>
    {loading&&<p className="rs-fifa-status">Calculando tus indicadores…</p>}
    {error&&<p className="rs-fifa-error" role="alert">{error}</p>}
    {rating&&<>
      <div className="rs-fifa-layout"><div className="rs-fifa-score" aria-label={rating.score===null?'Puntuación no disponible':`Puntuación global ${rating.score} de 100`}>
        <div className="rs-fifa-dial"><svg viewBox="0 0 132 132" role="presentation" aria-hidden="true">
          <circle cx="66" cy="66" r="51" stroke="currentColor" strokeOpacity=".11" strokeWidth="11" fill="none"/>
          <circle cx="66" cy="66" r="51" stroke="#30956b" strokeWidth="11" strokeLinecap="round" fill="none"
            strokeDasharray={`${2*Math.PI*51*(rating.score??0)/100} ${2*Math.PI*51}`}
            transform="rotate(-90 66 66)"/>
        </svg><span className="rs-fifa-score-value"><strong>{rating.score??'—'}</strong><small>{rating.score===null?'Sin nota':'de 100'}</small></span></div>
        <span className="rs-fifa-score-caption">Índice comparativo</span><span className="rs-fifa-score-conf">{rating.score===null?'No evaluable':`Confianza por cantidad: ${rating.confidence}`}</span>
      </div><div className="rs-fifa-bars">
        {attrs.map(a=><div className="rs-fifa-attr" key={a.key} title={a.detail}>
          <div className="rs-fifa-attr-line"><span>{a.label}</span><strong>{a.key==='resistencia'&&rating.attributes.resistencia===0?'<1':rating.attributes[a.key]??'—'}</strong></div>
          <div className="rs-fifa-track"><div className={a.key==='desnivel'?'terrain':''} style={{width:`${rating.attributes[a.key]??0}%`}}/></div>
        </div>)}
      </div></div>
      <div className="rs-fifa-raw"><span><b>{rating.activities}</b> actividades del historial</span><span><b>{formatted(rating.raw.resistanceP75Km,' km')}</b> distancia P75</span>
        <span><b>{formatted(rating.raw.medianSpeedKmh,' km/h')}</b> velocidad mediana</span><span><b>{formatted(rating.raw.ascentP75Per10Km,' m')}</b> ascenso por 10 km (P75)</span><span><b>{formatted(rating.raw.longestKm??null,' km')}</b> distancia máxima registrada</span></div>
      {rating.attributes.resistencia===0&&<p className="rs-fifa-notice"><strong>Resistencia* por debajo del percentil 1:</strong> la fórmula actual compara la distancia habitual (P75) con FitRec. Muchos calentamientos o series cortas pueden dar esta nota incluso si has hecho una media maratón. <strong>No mide tu capacidad física.</strong> La distancia máxima registrada aparece arriba; redefiniremos este atributo en el Rating 2.0 con un método validado.</p>}
      {rating.score!==null&&<div className="rs-fifa-insights">
        <p><TrendingUp size={17}/><span><b>Indicador relativamente alto:</b> {names[rating.strengths[0] as Attr]??'—'}.</span></p>
        <p><ShieldCheck size={17}/><span><b>Indicador relativamente bajo:</b> {names[rating.development[0] as Attr]??'—'}. No demuestra por sí solo una debilidad física.</span></p>
      </div>}
      {rating.status==='sin_referencia'&&<p className="rs-fifa-notice">Senderismo: podemos mostrar tus métricas, pero todavía no tenemos una población de referencia válida para generar notas de 0 a 100.</p>}
      {rating.status==='historial_insuficiente'&&<p className="rs-fifa-notice">Necesitamos al menos 10 actividades válidas de esta modalidad para una nota comparativa. La constancia exige además 84 días de historial.</p>}
      {rating.status==='incompleto'&&<p className="rs-fifa-notice">El historial todavía no permite calcular tres atributos con suficientes datos. Mostramos los disponibles sin inventar una nota general.</p>}
      <p className="rs-fifa-disclaimer">Las puntuaciones son percentiles estadísticos frente a usuarios de FitRec, no un modelo de ML ni un diagnóstico. El desnivel mide exposición a terreno montañoso, no habilidad para subir. FitRec es histórico y no representa a toda la población deportiva.</p>
    </>}
  </section>;
}
