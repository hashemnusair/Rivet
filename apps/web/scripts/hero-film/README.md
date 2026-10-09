# RIVET hero film

The landing page opens on a 36-second loop of the product (`src/components/marketing/hero-film.tsx`). The film is not hand-animated video: `film.html` + `film.js` draw it from a clock, and `render.mjs` photographs it frame by frame and encodes it with ffmpeg. Change the composition, re-render, and commit the files in `public/marketing/`.

## Render

```bash
pnpm --dir apps/web exec node scripts/hero-film/render.mjs
```

Needs `ffmpeg` on `PATH` and Playwright's Chromium. It writes, for the landscape (1920 × 1080) and portrait (1080 × 1920) cuts:

- `public/marketing/rivet-film.mp4` and `rivet-film-poster.jpg`
- `public/marketing/rivet-film-portrait.mp4` and `rivet-film-portrait-poster.jpg`

H.264 only: VP9 came out no smaller at the same quality. Film grain is drawn by the page over the video, because per-frame noise nearly doubles the file.

Useful flags: `--format landscape|portrait` (one cut), `--scale 1` (faster drafts; the default 2 renders at twice the size and downsamples so the screen text stays sharp), `--seconds 4` (first seconds only), `--stills 1.5,9,20 --out /tmp/stills` (review frames as JPEGs), `--crf 28`, `--poster 3.2`.

To watch it live, open `film.html?play` (or `film.html?format=portrait&play`) straight from disk in Chrome. `?t=12.5` holds one moment.

## Script

Six scenes, each crossfading into the next through a focus pull. Every screen is traced from the product's own route with the seeded demo tenant (Forge Fitness Club, branches Abdoun and Sweifieh), drawn in the night tokens. Chapter start times are mirrored in `src/components/marketing/hero-film-chapters.ts`; keep the two in step when the timing changes.

| Time | Scene | What happens | Traced from |
| --- | --- | --- | --- |
| 0 – 7 s | Check-in | Aya's Entry QR is scanned on her phone; the front desk confirms "Aya Al-Khatib checked in", the check-ins count rolls 46 → 47 and she joins "Who checked in today". Reception then types "Haya", picks Haya Malkawi from four matches and checks her in (48). | `/reception`, member Entry QR dialog |
| 7 – 13 s | Classes | The weekly timetable unfolds; Sunday's Morning HIIT lifts out of it, fills from 7 to 12 of 12 and shows Full with 3 waiting. | `/classes` |
| 13 – 19 s | Payments | Collect payment for Tala Malkawi's quarterly renewal: the amount counts to JOD 105.000, the method moves Cash → Card → CliQ, the payment is recorded and receipt R-2480 prints with nothing still owed. | `/payments`, collect-payment dialog, receipt |
| 19 – 24 s | Sales | On the leads board Tareq Tarawneh's follow-up is done, the card is carried from Trial to Membership sold and credited to Dina Saleh; the lane totals update. | `/crm/pipeline` |
| 24 – 30 s | Member timeline | Aya's record: enquiry, trial, sale, payment, check-ins, a recorded freeze and the renewal, each under the person who did it. | member profile timeline |
| 30 – 36 s | Every branch | The owner's dashboard counts up the day (JOD 1,284.500 collected, 213 check-ins) and draws the month's collections, then the camera pulls back over Amman to both branches. | `/dashboard` |

The last scene crossfades into the first, and the ambient light and grain repeat on the 36-second period, so the video loops without a seam.

## Rules

- Demo names, numbers and the QR are sample data from the mock tenant; the QR encodes "RIVET entry pass — illustration only" (`qr.js`). Never put real member data in the film.
- The title and the captions are not in the video. The page draws them, so they stay sharp, translate to Arabic and stay readable to assistive technology.
- Keep the centre of the frame calm enough for the name: the page darkens it, but the brightest moments sit on the thirds.
