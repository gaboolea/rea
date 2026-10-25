// Persistencia sencilla en un archivo JSON (escritura atómica y diferida).
// Suficiente para un servidor pequeño; para muchos jugadores convendría
// una base de datos real.
import fs from "node:fs";
import path from "node:path";

export class Store {
  constructor(dir) {
    this.file = path.join(dir, "db.json");
    fs.mkdirSync(dir, { recursive: true });
    this.data = { profiles: {}, cities: {} };
    try {
      this.data = {
        ...this.data,
        ...JSON.parse(fs.readFileSync(this.file, "utf8")),
      };
    } catch (err) {
      if (err.code !== "ENOENT")
        console.error("No se pudo leer la base de datos:", err.message);
    }
    this.timer = null;
  }

  // Agrupa escrituras: como mucho una cada 2 s.
  save() {
    if (this.timer) return;
    this.timer = setTimeout(() => this.flush(), 2000);
  }

  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.file);
  }
}
