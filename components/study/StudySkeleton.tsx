import styles from './StudySkeleton.module.css';

export function StudySkeleton({
  label = 'Carregando…',
  compact = false,
}: {
  label?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`${styles.skeleton} ${compact ? styles.compact : ''}`}
      role="status"
      aria-label={label}
      aria-live="polite"
      aria-busy="true"
    >
      <p className={styles.label}>{label}</p>
      <div className={styles.content} aria-hidden="true">
        <div className={`${styles.block} ${styles.heading}`} />
        <div className={`${styles.block} ${styles.line}`} />
        {!compact && (
          <>
            <div className={`${styles.block} ${styles.short}`} />
            <div className={styles.options}>
              {[0, 1, 2].map((i) => (
                <div className={`${styles.block} ${styles.option}`} key={i} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
