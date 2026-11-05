import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Search, Footprints, CheckCheck, XSquare } from 'lucide-react';

export type MlActivity = {
  id:string; name:string;date:string;sport:string;
  distanceKm:number;durationMinutes:number;ascentM:number;
  selected:boolean;alreadyImported?:boolean;source?:string;
};
type Props={
  items:MlActivity[]; selectedIds:Set<string>; busy:boolean;
  onSelection:(ids:string[],selected:boolean)=>void; kind:'preview'|'saved';
};
const fmt=(x:number,d=1)=>new Intl.NumberFormat('es-ES',{maximumFractionDigits:d}).format(x);
function fmtPace(time:number,dist:number){
  if(!Number.isFinite(time)||!Number.isFinite(dist)||dist<=0)return '—';
  const sec=Math.round(time/dist*60);
  return `${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')} min/km`;
}
const dateLabel=(value:string)=>{
  const d=new Date(`${value}T12:00:00Z`);
  return Number.isNaN(d.getTime())?value:new Intl.DateTimeFormat('es-ES',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).format(d);
};
export default function MLActivityPicker({items,selectedIds,busy,onSelection,kind}:Props){
  const [search,setSearch]=useState('');
  const [show,setShow]=useState<'all'|'selected'|'excluded'>('all');
  const [shortOnly,setShortOnly]=useState(false);
  const [page,setPage]=useState(1);
  const [sort,setSort]=useState<'newest'|'oldest'|'longest'|'shortest'>('newest');
  const filtered=useMemo(()=>{
    const query=search.trim().toLocaleLowerCase('es-ES');
    return items.filter(x=>(!query||`${x.name} ${x.date} ${x.sport}`.toLocaleLowerCase('es-ES').includes(query))
      &&(show==='all'||(show==='selected'?selectedIds.has(x.id):!selectedIds.has(x.id)))
      &&(!shortOnly||x.distanceKm<3))
      .sort((a,b)=>sort==='newest'?b.date.localeCompare(a.date):sort==='oldest'?a.date.localeCompare(b.date)
        :sort==='longest'?b.distanceKm-a.distanceKm:a.distanceKm-b.distanceKm);
  },[items,search,show,shortOnly,sort,selectedIds]);
  useEffect(()=>setPage(1),[search,show,shortOnly,sort,items.length]);
  const size=12,pages=Math.max(1,Math.ceil(filtered.length/size)),current=Math.min(page,pages);
  const visible=filtered.slice((current-1)*size,current*size);
  const selected=items.filter(x=>selectedIds.has(x.id)).length;
  const excluded=items.length-selected;
  const allShownChecked=visible.length>0&&visible.every(x=>selectedIds.has(x.id));
  return <div className="ml-picker">
    <div className="ml-picker-head">
      <div><strong><Footprints size={18}/> {kind==='preview'?'Carreras detectadas en el ZIP':'Mis carreras para IA'}</strong>
        <span>{items.length} disponibles · <b>{selected} seleccionadas</b> · {excluded} excluidas</span></div>
      <span className="ml-picker-count">{selected} / {items.length}</span>
    </div>
    <p className="ml-picker-help">{kind==='preview'
      ? 'Desmarca calentamientos y rodajes que no quieras utilizar. Después confirma para guardar tu selección.'
      : 'Las carreras excluidas siguen guardadas. Puedes volver a incluirlas cuando quieras; el modelo solo usa las marcadas.'}</p>
    <div className="ml-picker-filters">
      <label className="ml-picker-search"><Search size={16}/><input type="search" placeholder="Buscar nombre o fecha…" value={search} onChange={e=>setSearch(e.target.value)}/></label>
      <select aria-label="Filtrar selección" value={show} onChange={e=>setShow(e.target.value as typeof show)}><option value="all">Todas</option><option value="selected">Seleccionadas</option><option value="excluded">Excluidas</option></select>
      <select aria-label="Ordenar actividades" value={sort} onChange={e=>setSort(e.target.value as typeof sort)}><option value="newest">Más recientes</option><option value="oldest">Más antiguas</option><option value="longest">Mayor distancia</option><option value="shortest">Menor distancia</option></select>
      <label className="ml-picker-short"><input type="checkbox" checked={shortOnly} onChange={e=>setShortOnly(e.target.checked)}/> Menos de 3 km</label>
    </div>
    <div className="ml-picker-actions">
      <button type="button" disabled={busy||!filtered.length} onClick={()=>onSelection(filtered.map(x=>x.id),true)}><CheckCheck size={15}/> Incluir resultados filtrados</button>
      <button type="button" disabled={busy||!filtered.length} onClick={()=>onSelection(filtered.map(x=>x.id),false)}><XSquare size={15}/> Excluir resultados filtrados</button>
      <small>{filtered.length} actividad(es) coinciden con los filtros</small>
    </div>
    <div className="ml-picker-overflow"><table className="ml-picker-table"><thead><tr>
      <th className="ml-picker-check"><input type="checkbox" aria-label="Alternar página visible" checked={allShownChecked}
        disabled={busy||!visible.length} onChange={e=>onSelection(visible.map(x=>x.id),e.target.checked)}/></th>
      <th>Actividad</th><th>Fecha</th><th>Distancia</th><th>Duración</th><th>Ritmo</th><th>Desnivel +</th><th>Usar en IA</th>
    </tr></thead><tbody>
      {visible.map(x=><tr key={x.id} className={selectedIds.has(x.id)?'':'ml-picker-excluded'}>
        <td><input type="checkbox" aria-label={`Usar ${x.name} del ${x.date}`} checked={selectedIds.has(x.id)} disabled={busy} onChange={e=>onSelection([x.id],e.target.checked)}/></td>
        <td><div className="ml-picker-title">{x.name}</div><small>{x.sport==='Carrera'?'Running':x.sport}{x.alreadyImported?' · ya importada':''}</small></td>
        <td>{dateLabel(x.date)}</td><td>{fmt(x.distanceKm,2)} km</td><td>{fmt(x.durationMinutes)} min</td><td>{fmtPace(x.durationMinutes,x.distanceKm)}</td><td>+{fmt(x.ascentM,0)} m</td>
        <td><span className={selectedIds.has(x.id)?'ml-picker-tag active':'ml-picker-tag'}>{selectedIds.has(x.id)?'Incluida':'Excluida'}</span></td>
      </tr>)}
      {!visible.length&&<tr><td colSpan={8} className="ml-picker-empty">Ninguna carrera coincide con los filtros actuales.</td></tr>}
    </tbody></table></div>
    <div className="ml-picker-pagination"><small>Página {current} de {pages}</small><div>
      <button type="button" aria-label="Anterior" disabled={current<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}><ChevronLeft size={17}/></button>
      <button type="button" aria-label="Siguiente" disabled={current>=pages} onClick={()=>setPage(p=>Math.min(pages,p+1))}><ChevronRight size={17}/></button>
    </div></div>
  </div>;
}
