<div align="center">

# Ricardo Pneus Management

#### Offline-first desktop management system built for a real tire shop: inventory, store credit, finances and reports in one native app.

![Tauri](https://img.shields.io/badge/Tauri-24C8DB?style=for-the-badge&logo=tauri&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-000000?style=for-the-badge&logo=rust&logoColor=white)

</div>

---

## Overview

A desktop management system built for a real tire shop (borracharia). It runs as a native, offline-first application, so the shop can manage the whole operation on their own machine without depending on an internet connection.

This is a freelance project shipped for an actual client, not a demo. The goal was a tool simple enough for a small business to use every day, but complete enough to replace the notebook and the spreadsheet.

## Features

| Module | What it does |
|--------|--------------|
| Dashboard | At-a-glance view of the day: sales, stock and pending balances |
| Inventory (Estoque) | Products and stock control, with a quick product picker for sales |
| Store Credit (Fiado) | Customer credit ledger, the informal "buy now, pay later" that small shops rely on |
| Finances (Financeiro) | Cash flow, income and expenses |
| Reports (Relatorios) | Business reports and charts over time |
| Backup | Local backups so the shop never loses its data |

## Tech Stack

- **Tauri** (Rust) for a lightweight native desktop shell
- **React** + **TypeScript** + **Vite** for the interface
- **shadcn/ui** and **Recharts** for components and charts
- Runs fully offline, packaged as a native installer

## Running Locally

```bash
npm install
npm run tauri dev     # run the desktop app in development
npm run tauri build   # produce a native installer
```

---

<div align="center">

Built as a freelance project for a real tire shop.

</div>
