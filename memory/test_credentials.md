# Test Credentials — CromoFútbol Tenerife

## Admin (auto-seed en startup, vía variables ADMIN_EMAIL / ADMIN_PASSWORD)
- Email: `admin@cromofutbol.es`
- Username: `admin`
- Password: `Fitipaldi8@`
- Role: `admin`

## Endpoint de login
`POST /api/auth/login`
```json
{ "identifier": "admin@cromofutbol.es", "password": "Fitipaldi8@" }
```

> NOTA: El admin se crea solo si no existe previamente (idempotente). Si en el futuro se cambia
> ADMIN_PASSWORD en `.env` y el admin ya existe en MongoDB, deberás actualizar el `password_hash`
> en la colección `users` o borrar el documento para que el seed lo recree.
