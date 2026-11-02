# Event Service â€” local development

Java 17+, MariaDB, port 8081. Packages are grouped by technical layer.

## Run

Start MariaDB using `deploy/compose/docker-compose.yml` from the repository root.
Set DB_PASSWORD (and optionally DB_URL, DB_USERNAME) in the IDE environment.
The existing application config also imports the local Compose .env file.
From eventservice run `./mvnw.cmd spring-boot:run`.

Flyway runs `src/main/resources/db/migration/V1__create_event_schema.sql` on startup.
Hibernate uses `ddl-auto=validate`: schema changes must be written as migrations.
The service never resets existing data. Flyway clean and automatic baseline are disabled.

## Database migrations

For a new, empty database, just start the application. Flyway creates the tables
and records V1 in `flyway_schema_history` before JPA validates the schema.

For an existing database previously created by Hibernate, startup intentionally
fails if it has tables but no Flyway history. Do not enable baseline-on-migrate
blindly: baselining skips V1 without verifying its constraints and indexes.

For local development, use a NEW empty database (for example
`ticketnow_event_flyway`) and configure DB_NAME or DB_URL to point to it; grant
`event_user` access to that database using an administrator account. The old
database and its data can be kept intact. MariaDB's MARIADB_DATABASE variable
only creates a database when the data volume is initialized for the first time.

If existing data must be retained in place, back it up and compare all columns,
constraints and indexes against V1, reconcile differences, then perform a deliberate
Flyway baseline at version 1. This is an operator action, not automatic startup behavior.

After V1 has been applied, never edit it. Add `V2__description.sql`, then V3, etc.
Verify migration status with `SELECT * FROM flyway_schema_history;`.

## API contract

All routes use /api/v1 and JSON. This is an unauthenticated local foundation:
organizerId is fixed to local-development. Reads include drafts for development.
Integrate Keycloak, ownership checks and public visibility rules before exposing it.

| Resource | Routes |
| --- | --- |
| Venues | GET/POST /venues; GET/PUT/DELETE /venues/{id} |
| Events | GET/POST /events; GET/PUT/DELETE /events/{id} |
| Ticket tiers | GET/POST /events/{eventId}/ticket-tiers; GET/PUT/DELETE /events/{eventId}/ticket-tiers/{id} |

POST returns 201 and Location; DELETE returns 204. Lists of venues/events use
page (default 0), size (1â€“100, default 20), content, totalElements, totalPages.
PUT replaces editable fields. Errors use application/problem+json (400/404/409).
Event updates and deletions are restricted to DRAFT. Referenced venues cannot
be deleted. Deleting a draft also deletes its ticket tiers.

### Create venue

```json
{"name":"Theater","address":"123 Main","city":"HCM","capacity":1000}
```

### Create event (use venue ID from the previous response)

```json
{"title":"Concert","description":"Demo","venueId":"<venue-id>","startsAt":"2026-12-20T19:00:00+07:00","endsAt":"2026-12-20T22:00:00+07:00"}
```

### Create tier (under the event ID)

```json
{"name":"VIP","price":500000.00,"currency":"VND"}
```

Seat maps, publishing, sale schedules, Kafka, Redis and Keycloak are pending.
Prices use BigDecimal; timestamps use Instant. Test with `./mvnw.cmd test`.
Tests run the same Flyway migration and JPA validation against isolated H2 in MariaDB compatibility mode; they do not touch the live MariaDB database.

### Optional MariaDB migration check

Point these environment variables at an ISOLATED empty test database, never at
application data, then run `./mvnw.cmd test`:

- `MARIADB_MIGRATION_TEST_URL`: JDBC MariaDB URL
- `MARIADB_MIGRATION_TEST_USERNAME`: test database user (default root)
- `MARIADB_MIGRATION_TEST_PASSWORD`: test database password

Without MARIADB_MIGRATION_TEST_URL this test is skipped. It runs V1, starts JPA
with schema validation, and checks that a second migration invocation is a no-op.
Verified with the Compose image MariaDB 12.3.3. Flyway 11.14.1 logs a warning that
MariaDB 12.3 is newer than its verified range; this smoke check passed, but it is
not a guarantee of compatibility with every migration feature.
