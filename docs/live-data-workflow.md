# Proposed: refresh the live data in the deploy workflow (not applied)

`pages.yml` is edited only by the repository's owner. To keep Live from space, Space news and Space today as fresh as the launch feed,
add this step to the build job in `.github/workflows/pages.yml`, right after the step that fetches `dist/launches.json` and before
`python3 build.py`:

```yaml
      - name: Fetch NASA, NOAA and space news data
        env:
          NASA_API_KEY: ${{ secrets.NASA_API_KEY }}   # optional; only APOD uses it. Add it under Settings, Secrets and variables, Actions
        run: |
          pip install --quiet "pillow>=11.3"
          python3 scripts/fetch_nasa.py --feed dist/launches.json || echo "NASA data: kept the last good copy"
```

- **Calls per run:** about eight. EPIC (two images), NOAA SWPC (three files), EONET, JPL close approach and the Spaceflight News API need
  no key; APOD uses the key when there is one, else the demo key. Every 30 minutes that is well inside every source's limits.
- **Failures:** a failed source keeps its last good copy, marked stale, and the step never fails the deploy.
- **The key:** it is never written to a file or a log (`clean()` in the script strips it from error messages).
- **The results:** they land in `dist/` only through the build, so nothing is committed by the workflow.
