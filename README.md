# Mapper ETL

Aplicación web para cargar CSV, seleccionar columnas manualmente o sugerirlas con Gemini y exportar todos los registros filtrados por columnas.

## Requisitos
- Node.js 20 o superior
- npm
- Una clave de Google AI Studio (opcional, solo para usar sugerencias IA)

## Instalación
1. Descomprime el ZIP.
2. Abre una terminal en la carpeta `mapper-etl`.
3. Ejecuta:
   ```bash
   npm install
   ```
4. Copia `server/.env.example` a `server/.env` y agrega tu clave:
   ```env
   GEMINI_API_KEY=tu_clave_de_gemini
   GEMINI_MODEL=gemini-2.5-flash
   PORT=3001
   ```
   La aplicación también funciona sin clave: la carga, selección y exportación CSV están disponibles; la función IA mostrará un aviso.
5. Inicia ambos servidores:
   ```bash
   npm run dev
   ```
6. Abre http://localhost:5173

## Uso
- Pulsa **Subir CSV** y selecciona un archivo `.csv`.
- Marca las columnas que deseas conservar o utiliza selección masiva.
- Escribe el objetivo del CSV final y pulsa **Sugerir columnas con IA**.
- Revisa y ajusta las casillas sugeridas.
- Pulsa **Exportar CSV**. Se conservan todos los registros, el orden original de las filas y el orden de columnas elegido.

## Notas técnicas
- Papa Parse procesa delimitadores detectados, campos entre comillas y saltos de línea dentro de campos.
- Se valida el archivo vacío, errores de análisis y encabezados inválidos.
- Se intenta decodificar UTF-8 y, si no es válido, Windows-1252. La exportación usa la codificación detectada.
- El backend nunca expone la clave Gemini al navegador.
