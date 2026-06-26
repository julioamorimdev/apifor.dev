export const metadata = { title: "apiforDEV", description: "Orquestrador de workers de IA" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, background: "#0A0B0D", color: "#E8EAED", fontFamily: "system-ui, sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
