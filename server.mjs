import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

const PUBLIC_DIR = join(__dirname, 'public');

app.use(express.static(PUBLIC_DIR, {
  extensions: ['html'],
  index: 'index.html',
}));

app.get('/work/:name', (req, res) => {
  const name = req.params.name;
  if (!/^[a-z0-9-]+$/.test(name)) return res.status(400).send('bad name');
  res.sendFile(join(PUBLIC_DIR, 'work', `${name}.html`), (err) => {
    if (err) res.status(404).sendFile(join(PUBLIC_DIR, '404.html'));
  });
});

app.get('/api/trace/:name', (req, res) => {
  const name = req.params.name;
  if (!/^[a-z0-9-]+$/.test(name)) return res.status(400).json({ error: 'bad name' });
  res.sendFile(join(PUBLIC_DIR, 'assets', 'trace-data', `${name}.json`), (err) => {
    if (err) res.status(404).json({ error: 'trace not found' });
  });
});

app.use((req, res) => {
  res.status(404).sendFile(join(PUBLIC_DIR, '404.html'));
});

app.listen(PORT, () => {
  console.log(`[7tics] listening on :${PORT}`);
});

export default app;
