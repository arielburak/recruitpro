export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-full flex items-center justify-center bg-gray-50 py-12 px-4">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
