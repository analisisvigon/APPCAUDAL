import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';

import '../index.css';
import PlayerNavigation from '../components/player/PlayerNavigation';
import PlayerFinesPanel from '../components/player/PlayerFinesPanel';
import PlayerFinesTransparencyPanel from '../components/player/PlayerFinesTransparencyPanel';
import FinesManagementPage from '../components/fines/FinesManagementPage';

const fines = [
  { fine_id: '1', subject_name: 'Borja Rodríguez', rule_name: 'Retraso al entrenamiento', rule_description: 'Llegada después de la hora indicada.', occurred_on: '2026-09-01', original_amount: 10, surcharge_amount: 2, generated_amount: 12, collected_amount: 4, pending_amount: 8, financial_status: 'partial', lifecycle_status: 'active', due_on: '2026-09-05', is_overdue: true, note: 'Pago parcial registrado por el delegado.' },
  { fine_id: '2', subject_name: 'Julio Rodríguez con un nombre especialmente largo', rule_name: 'Material deportivo olvidado', occurred_on: '2026-08-28', original_amount: 5, surcharge_amount: 0, generated_amount: 5, collected_amount: 5, pending_amount: 0, financial_status: 'paid', lifecycle_status: 'active', due_on: '2026-09-04', is_overdue: false },
  { fine_id: '3', subject_name: 'Jairo Cárcaba', rule_name: 'Incumplimiento de normativa interna', occurred_on: '2026-08-20', original_amount: 15, surcharge_amount: 0, generated_amount: 15, collected_amount: 0, pending_amount: 15, financial_status: 'unpaid', lifecycle_status: 'active', due_on: '2026-09-20', is_overdue: false },
];
const subjects = [
  { subject_id: 's1', display_name: 'Borja Rodríguez', subject_type: 'player', subject_name: 'Borja Rodríguez', fine_count: 3, active_count: 2, paid_count: 1, overdue_count: 1, generated_total: 24, collected_total: 18, pending_total: 6 },
  { subject_id: 's2', display_name: 'Julio Rodríguez', subject_type: 'player', subject_name: 'Julio Rodríguez', fine_count: 2, active_count: 1, paid_count: 1, overdue_count: 0, generated_total: 14, collected_total: 10, pending_total: 4 },
  { subject_id: 's3', display_name: 'Jairo Cárcaba', subject_type: 'player', subject_name: 'Jairo Cárcaba', fine_count: 2, active_count: 2, paid_count: 0, overdue_count: 0, generated_total: 18, collected_total: 3, pending_total: 15 },
  { subject_id: 's4', display_name: 'Agus Porto', subject_type: 'player', subject_name: 'Agus Porto', fine_count: 1, active_count: 0, paid_count: 1, overdue_count: 0, generated_total: 8, collected_total: 8, pending_total: 0 },
];
const rules = [
  { fine_rule_id: 'r1', name: 'Retraso al entrenamiento', default_amount: 10, collective_allowed: true, rule_name: 'Retraso al entrenamiento', fine_count: 4, generated_total: 40 },
  { fine_rule_id: 'r2', name: 'Material olvidado', default_amount: 5, collective_allowed: true, rule_name: 'Material olvidado', fine_count: 3, generated_total: 15 },
];
const summary = { season_code: '2026', total_fines: 8, active_fines: 5, unpaid_count: 2, partial_count: 2, paid_count: 3, cancelled_count: 1, overdue_count: 1, generated_total: 64, collected_total: 39, pending_total: 25, surcharge_total: 2 };

const client = {
  rpc: async (name) => ({ data: ({
    get_my_fines_summary: [{ active_fines: 2, paid_count: 1, surcharge_total: 2, collected_total: 9, pending_total: 23 }],
    get_my_fines: fines.map(({ subject_name, is_overdue, ...fine }) => fine),
    get_fines_transparency_summary: [summary],
    get_fines_transparency_subjects: subjects,
    get_fines_transparency_rules: rules,
    get_fines_transparency_list: fines,
    get_fines_financial_summary: [summary],
    get_fines_management_list: fines,
    get_fines_subject_summary: subjects,
    get_fine_rules_for_management: rules,
    get_fine_subjects_for_management: subjects,
  })[name] || [{ ok: true }], error: null }),
};

function QaApp() {
  const params = new URLSearchParams(window.location.search);
  const view = params.get('view') || 'player';
  useEffect(() => {
    const audit = () => {
      const width = Math.max(document.body.scrollWidth, document.documentElement.scrollWidth);
      document.documentElement.dataset.viewportWidth = String(window.innerWidth);
      document.documentElement.dataset.scrollWidth = String(width);
      document.documentElement.dataset.overflowOk = String(width <= window.innerWidth);
    };
    const timeout = window.setTimeout(() => {
      if (view === 'modal') [...document.querySelectorAll('button')].find((button) => button.textContent.includes('Nueva multa'))?.click();
      audit();
      window.setTimeout(audit, 250);
    }, 250);
    window.addEventListener('resize', audit);
    return () => { window.clearTimeout(timeout); window.removeEventListener('resize', audit); };
  }, [view]);
  return <div className="min-h-screen overflow-x-clip bg-[#02070f] px-3 py-3 text-white">
    <main className="mx-auto max-w-6xl space-y-4">
      {view === 'player' ? <><PlayerNavigation activeSection="fines" canManageFines onChange={() => {}} onSignOut={() => {}} /><PlayerFinesPanel client={client} /></> : null}
      {view === 'transparency' ? <PlayerFinesTransparencyPanel client={client} /> : null}
      {view === 'manager' || view === 'modal' ? <FinesManagementPage client={client} title="Gestión de multas" /> : null}
    </main>
  </div>;
}

ReactDOM.createRoot(document.getElementById('root')).render(<QaApp />);
