import { Mountain } from 'lucide-react';
import { Link } from 'react-router-dom';
export function Brand({ light = false }: { light?: boolean }) {
  return <Link to="/dashboard" className={`brand ${light ? 'brand-light' : ''}`} aria-label="RaceEstrategy, inicio">
    <span className="brand-icon"><Mountain size={23} strokeWidth={2.3} /></span>
    <span>race<span className="brand-accent">estrategy</span><span className="brand-point">.</span></span>
  </Link>;
}
export function Landscape({ className = '' }: { className?: string }) {
  return <svg className={className} viewBox="0 0 900 580" preserveAspectRatio="xMidYMax slice" fill="none" aria-hidden="true">
    <circle cx="695" cy="144" r="85" fill="#e5f3cb" opacity=".75"/>
    <path d="M0 356 110 278 216 338 351 190 476 334 588 230 724 334 820 276 900 338V580H0Z" fill="#a6c6ac"/>
    <path d="M0 414 120 342 244 403 385 265 510 404 642 300 760 397 900 325V580H0Z" fill="#76a28a"/>
    <path d="M0 482 124 434 255 490 410 381 538 471 684 397 827 445 900 415V580H0Z" fill="#427c65"/>
    <path d="M0 526C150 479 210 518 326 501s185-62 295-42 185 2 279-21v142H0Z" fill="#245a4b"/>
    <path d="M535 580c68-66 139-74 152-100 5-10-5-18-44-19-35-1-49-8-47-15 4-10 38-18 70-27" stroke="#b9d1af" strokeWidth="13" opacity=".6" strokeLinecap="round"/>
    {Array.from({length: 12}, (_,i) => {
      const x = 22 + i*83; const y = 472 + (i%3)*17;
      return <g key={i} transform={`translate(${x} ${y})`} opacity=".45"><path d="M0-45 16-10H-16Z" fill="#184e41"/><path d="M0-31 22 0H-22Z" fill="#184e41"/><path d="M0-7V8" stroke="#184e41" strokeWidth="4"/></g>;
    })}
  </svg>;
}
