export function download(name: string, body: string | Blob, type?: string): void {
  const blob = body instanceof Blob ? body : new Blob([body], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
