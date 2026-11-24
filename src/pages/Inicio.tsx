import { Link } from 'react-router-dom';
import styles from './Inicio.module.css';

export default function Inicio() {
    return (
        <div className={styles.site}>
            <header className={styles.header}>
                <a className={styles.brand} href="/">Salita Municipal</a>
                <nav aria-label="Navegación principal">
                    <a href="#turnos">Turnos</a>
                    <Link to="/login">Ingresar</Link>
                </nav>
            </header>
            <main>
                <section className={styles.hero} aria-labelledby="titulo">
                    <div>
                        <h1 id="titulo">Tu centro de salud, cerca.</h1>
                        <p>Información para vecinos y acceso al sistema de atención de la salita municipal.</p>
                        <a className={styles.button} href="#turnos">Cómo consultar por un turno</a>
                    </div>
                    <img src="/images/salita-municipal.png" alt="Logo de la Salita Municipal" />
                </section>
                <section id="turnos" className={styles.information} aria-labelledby="titulo-turnos">
                    <article>
                        <h2 id="titulo-turnos">Consultas y turnos</h2>
                        <p>Consultá con recepción de la salita para conocer los horarios de atención y la disponibilidad de turnos.</p>
                    </article>
                    <article>
                        <h2>Acceso a tu portal</h2>
                        <p>Ingresá con tu cuenta para usar el portal de la salita.</p>
                        <Link to="/login">Ingresar al sistema</Link>
                    </article>
                </section>
            </main>
            <footer className={styles.footer}>Salita Municipal</footer>
        </div>
    );
}

