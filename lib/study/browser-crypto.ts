// OpenMAIC storage's shared material-id helpers reach its Node crypto import
// through the package barrel. Use the browser CSPRNG for those two primitives.
export const randomUUID = () => globalThis.crypto.randomUUID();
export function randomBytes(size: number) {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(size));
  return {
    toString(encoding: string) {
      if (encoding === 'hex')
        return Array.from(bytes, (n) => n.toString(16).padStart(2, '0')).join('');
      const value = btoa(String.fromCharCode(...bytes));
      if (encoding === 'base64') return value;
      if (encoding === 'base64url')
        return value.replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
      throw new Error('Unsupported random byte encoding');
    },
  };
}
