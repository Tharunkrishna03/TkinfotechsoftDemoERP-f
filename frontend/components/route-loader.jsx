import styles from "./route-loader.module.css";

const DEFAULT_DELAY_MS = 250;

export default function RouteLoader({ delayMs = DEFAULT_DELAY_MS }) {
  return (
    <div
      className={styles.overlay}
      style={{ "--route-loader-delay": `${Math.max(delayMs, 0)}ms` }}
      role="status"
      aria-live="polite"
      aria-label="Loading"
    >
      <div className={styles.dotGroup}>
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.dot} />
      </div>
    </div>
  );
}
