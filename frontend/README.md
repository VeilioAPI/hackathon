# Veilio Exchange Frontend

Next.js application for Veilio Exchange governance workflows.

## Development

```powershell
npm install
npm run dev
```

App URL: [http://localhost:3000](http://localhost:3000)

## Production build

```powershell
npm run build
npm run start
```

## Notes

- API requests use same-origin `/api` paths.
- In Docker and local reverse-proxy setups, rewrites forward `/api/*` to the backend service.