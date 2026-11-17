# Making the introduction video

The tour (`public/intro.mp4`) gives every tool one section, in menu order, in the Kokoro voice `am_fenrir` at speed 0.95.

1. **Script:** `scripts/tour-script.json`, one entry per section: `id`, `page`, `cap` (heading, title, caption line) and `text`
   (the narration; spell out numbers and letters the way they should be spoken). Keep each section about 55–70 words.
2. **Narration:** run the *Narration for the intro video (Kokoro)* workflow with `lines_file: scripts/tour-script.json`,
   voice `am_fenrir`, speed `0.95`. It saves the WAVs, Whisper transcripts and phonemes on the `narration` pre-release.
3. **Map tiles:** the recorder serves maps and NOAA data offline from `/tmp/tiles` and a NOAA capture; it logs anything
   missing to `/tmp/tiles/missing.txt`. Put those URLs in `scripts/video/tile-urls.txt` and run *Map tiles for the
   intro video* with `urls_file` to fetch them.
4. **Record:** build the app, `npx vite preview --port 4173`, then
   `node scripts/video/tour-record.cjs <narration dir> <out dir> [first id] [last id]`. Keep the machine idle while it records.
5. **Assemble:** `python3 scripts/video/tour-assemble.py <old intro.mp4> <narration dir> <recording dir> <out.mp4> 26`
   (set `PATCH=<dir>` to drop in sections re-recorded on their own). The opening and closing cards are reused from the
   old video. Then re-encode with `-crf 30 -preset slow -tune animation` to keep the file well under GitHub's 100 MB limit.
