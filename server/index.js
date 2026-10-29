import app from './app.js';

// Servidor local para desarrollo. En Vercel la app se expone desde api/index.js
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🚀 API Servidor COMEX corriendo en http://localhost:${PORT}`);
});
