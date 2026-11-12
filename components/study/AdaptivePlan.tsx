'use client';
import { useEffect, useState } from 'react';
import { dateKey, planStudy, recordSession, type Workspace } from '@/lib/study/domain';
import type { PlanItem } from '@/lib/study/planner';
import { pt } from '@/lib/study/locale';
import { Dialog, Field } from './shared';

export function AdaptivePlan({
  state,
  commit,
  notify,
}: {
  state: Workspace;
  commit: (data: Workspace) => Promise<void>;
  notify: (text: string) => void;
}) {
  const [availability, setAvailability] = useState(state.availability);
  const [entry, setEntry] = useState<{ item: PlanItem; actual: number; completed: number } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => setAvailability(state.availability), [state.availability]);
  const plan = planStudy(state, clock),
    today = dateKey(clock);
  const save = async (data: Workspace) => {
    setBusy(true);
    try {
      await commit(data);
      return true;
    } catch (e) {
      notify((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const todayEnergy = !state.energyDate || state.energyDate === today ? state.energy : 'normal';
  const names = { lesson: 'Aula / leitura', practice: 'Prática', review: 'Revisão' };
  return (
    <>
      <details className="study-card guria-plan-controls">
        <summary>Seu tempo disponível</summary>
        <p className="study-muted">
          Minutos totais, incluindo as pausas sugeridas. O plano é recalculado neste computador, sem
          IA.
        </p>
        <div className="study-days">
          {availability.map((v, i) => (
            <Field key={i} title={pt.weekdays[i]}>
              <input
                aria-label={`Minutos ${pt.weekdays[i]}`}
                className="study-input"
                type="number"
                min="0"
                max="720"
                value={v}
                onChange={(e) =>
                  setAvailability((a) => a.map((x, j) => (j === i ? Number(e.target.value) : x)))
                }
              />
            </Field>
          ))}
        </div>
        <button
          className="study-btn primary"
          disabled={busy}
          onClick={() => void save({ ...state, availability })}
        >
          Salvar disponibilidade
        </button>
        <Field title={pt.energy}>
          <select
            className="study-input"
            value={todayEnergy}
            disabled={busy}
            onChange={(e) =>
              void save({
                ...state,
                energy: e.target.value as Workspace['energy'],
                energyDate: today,
              })
            }
          >
            {Object.entries(pt.energies).map(([id, label]) => (
              <option value={id} key={id}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <p className="study-muted">
          {pt.energyHelp[todayEnergy]} Este ajuste vale para hoje; os próximos dias usam o ritmo
          normal.
        </p>
        <button
          className="study-btn"
          disabled={busy}
          onClick={() => {
            const dayOverrides = { ...state.dayOverrides };
            if (dayOverrides[today] === 0) delete dayOverrides[today];
            else dayOverrides[today] = 0;
            void save({ ...state, dayOverrides });
          }}
        >
          {state.dayOverrides[today] === 0
            ? 'Restaurar disponibilidade de hoje'
            : 'Hoje não vou estudar · redistribuir'}
        </button>
      </details>
      <p className="study-note guria-plan-intro">
        {pt.planHelp} Registrar tempo não concede domínio de um conceito. As previsões consideram o
        ritmo das últimas sessões e podem mudar.
      </p>
      {plan.conflicts.map((c) => (
        <div className="study-alert" key={c.courseId}>
          <strong>{state.courses.find((x) => x.id === c.courseId)?.title}</strong>:{' '}
          {c.missing === null
            ? pt.unknown
            : `${pt.conflict} Faltam aproximadamente ${c.missing} minutos no prazo/horizonte.`}
          {c.missing !== null &&
            plan.finish[c.courseId] &&
            ` Previsão com a carga atual: ${plan.finish[c.courseId]}.`}
        </div>
      ))}
      {plan.days.map((day) => (
        <section
          className="study-card guria-plan-day"
          data-today={day.date === today}
          key={day.date}
        >
          <h2>{day.date === today ? 'Hoje' : day.date}</h2>
          <p className="study-muted">
            {day.logged} min registrados · {day.items.reduce((n, i) => n + i.minutes, 0)} min
            planejados · {day.breaks} min de pausas · limite {day.limit} min
          </p>
          {day.logged > day.limit && (
            <p className="study-note">
              Você registrou mais tempo que o limite deste dia. Nenhuma carga extra será criada nos
              próximos dias.
            </p>
          )}
          {!day.items.length && <p className="study-muted">Sem bloco pendente para este dia.</p>}
          {day.items.map((item, i) => (
            <div key={item.id} className="guria-plan-block">
              {(i > 0 || day.logged > 0) && (
                <small className="study-muted">Faça uma pausa antes deste bloco.</small>
              )}
              <div className="study-row" style={{ justifyContent: 'space-between' }}>
                <div>
                  <span className="study-pill">{names[item.kind]}</span>{' '}
                  <strong>{item.title}</strong>
                  <p className="study-muted">
                    {item.minutes} min estimados · {item.reason}
                  </p>
                </div>
                {day.date === today && (
                  <button
                    className="study-btn"
                    disabled={busy}
                    onClick={() =>
                      setEntry({ item, actual: item.minutes, completed: item.workMinutes })
                    }
                  >
                    Registrar sessão
                  </button>
                )}
              </div>
            </div>
          ))}
        </section>
      ))}
      {!!state.sessions.length && (
        <section className="study-card">
          <h2>Realizado</h2>
          <p className="study-muted">
            Ritmo estimado: aulas {plan.pace.lesson.toFixed(2)}×, prática{' '}
            {plan.pace.practice.toFixed(2)}×, revisão {plan.pace.review.toFixed(2)}× a duração
            original.
          </p>
          {[...state.sessions]
            .reverse()
            .slice(0, 20)
            .map((s) => (
              <div
                className="study-row"
                key={s.id}
                style={{ justifyContent: 'space-between', margin: '12px 0' }}
              >
                <span>
                  {s.date} · {s.title} · {s.actualMinutes} min gastos / {s.completedMinutes} min de
                  conteúdo concluídos
                </span>
                <button
                  className="study-btn"
                  disabled={busy}
                  onClick={() =>
                    void save({ ...state, sessions: state.sessions.filter((x) => x.id !== s.id) })
                  }
                >
                  Desfazer registro
                </button>
              </div>
            ))}
        </section>
      )}
      {entry && (
        <Dialog title="Registrar o que você realizou" busy={busy} close={() => setEntry(null)}>
          <p>{entry.item.title}</p>
          <Field title="Tempo realmente gasto (minutos)">
            <input
              className="study-input"
              type="number"
              min="1"
              max="720"
              value={entry.actual}
              onChange={(e) => setEntry({ ...entry, actual: Number(e.target.value) })}
            />
          </Field>
          <Field
            title={`Quanto do bloco concluiu? (0 a ${entry.item.workMinutes} minutos de conteúdo)`}
          >
            <input
              className="study-input"
              type="number"
              min="0"
              max={entry.item.workMinutes}
              step="0.01"
              value={entry.completed}
              onChange={(e) => setEntry({ ...entry, completed: Number(e.target.value) })}
            />
          </Field>
          <p className="study-muted">
            Exemplo: uma aula de 20 minutos pode levar 30 minutos com anotações. O tempo gasto
            ajusta a previsão; o conteúdo concluído reduz o trabalho restante. Um bloco parcial será
            redistribuído.
          </p>
          <button
            className="study-btn primary"
            disabled={busy}
            onClick={async () => {
              try {
                if (
                  await save(recordSession(state, entry.item, entry.actual, entry.completed, today))
                )
                  setEntry(null);
              } catch (e) {
                notify((e as Error).message);
              }
            }}
          >
            Salvar sessão e adaptar plano
          </button>
        </Dialog>
      )}
    </>
  );
}
