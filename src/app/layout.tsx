import './globals.css';
import 'katex/dist/katex.min.css';
import styles from './layout.module.css';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={styles.appContainer}>
        {children}
      </body>
    </html>
  );
}
