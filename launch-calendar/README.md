# Why this folder exists

The Marketing Calendar (formerly Launch Calendar) used to live here. It runs on
Cloudflare Workers now, and nothing in this repo is served by Vercel: the static
pages ship through GitHub Pages and the workers through wrangler.

A Vercel project ("mobius-tools", team mobius-digital1) is still connected to
this GitHub repository with its Root Directory set to `launch-calendar`. After
the folder was removed on 2026-08-26 every push to main and every pull request
got a red "Vercel" check for a build that had nothing to build.

`vercel.json` here switches Vercel's GitHub deployments off for that project, so
the check stops appearing. The clean fix is to delete the Vercel project (or
disconnect it from the repo) in the Vercel dashboard; once that is done this
folder can go.
