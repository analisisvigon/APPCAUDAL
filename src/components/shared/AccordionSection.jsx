import { useState } from 'react';

export default function AccordionSection({ title, subtitle = '', defaultOpen = false, children, className = '' }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section className={`rounded-3xl border border-white/5 bg-[#091428]/80 shadow-glow md:border-0 md:bg-transparent md:shadow-none ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex min-h-[58px] w-full items-center justify-between gap-4 px-5 py-4 text-left md:hidden"
      >
        <span>
          <span className="block text-sm font-black uppercase tracking-[0.18em] text-white">{title}</span>
          {subtitle ? <span className="mt-1 block text-sm text-slate-400">{subtitle}</span> : null}
        </span>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-lg font-black text-white transition md:hidden ${isOpen ? 'rotate-180' : ''}`}>
          ˅
        </span>
      </button>
      <div className={`${isOpen ? 'block' : 'hidden'} px-5 pb-5 md:block md:p-0`}>
        {children}
      </div>
    </section>
  );
}
