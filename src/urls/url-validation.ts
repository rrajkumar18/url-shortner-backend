export function validateDestination(originalUrl: string): URL {
	const parsedUrl = new URL(originalUrl);

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('Only HTTP and HTTPS URLs are allowed');
  }

  if (!parsedUrl.hostname) {
    throw new Error('URL must contain a hostname');
  }

  if (parsedUrl.username || parsedUrl.password) {
    throw new Error('URLs containing credentials are not allowed');
  }

  return parsedUrl;
}