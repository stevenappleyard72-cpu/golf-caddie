import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = Number(process.env.PORT || 4174);
const DIST_DIR = path.join(__dirname, 'dist');
const COURSE_PATH = path.join(
  __dirname,
  'Documents',
  'GolfCaddie_Handover',
  'chislehurst_course',
  'chislehurst-course.json'
);

function readCourseData() {
  const raw = fs.readFileSync(COURSE_PATH, 'utf8');
  return JSON.parse(raw);
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, status: 'GolfCaddie service online' });
});

app.get('/api/course', (_req, res) => {
  try {
    const data = readCourseData();
    res.json({ ok: true, course: data });
  } catch (error) {
    console.error('Failed to read course JSON', error);
    res.status(500).json({ ok: false, error: 'Course data unavailable' });
  }
});

app.use(express.static(DIST_DIR));

app.get('*', (_req, res) => {
  const indexPath = path.join(DIST_DIR, 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }

  return res.send(`
    <html>
      <body>
        <h1>GolfCaddie</h1>
        <p>Build the app with npm run build before starting the server.</p>
      </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`GolfCaddie server listening on http://localhost:${PORT}`);
});
