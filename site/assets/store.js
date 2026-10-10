// Replace this URL with the YOURDRUM product URL when the Gumroad listing is ready.
const YOURDRUM_GUMROAD_URL = 'https://gumroad.com/';
document.querySelectorAll('[data-gumroad]').forEach(link => {
  link.href = YOURDRUM_GUMROAD_URL;
});
