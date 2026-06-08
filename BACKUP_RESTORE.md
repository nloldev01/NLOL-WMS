# Database Backup & Restore

## Backups

Backups are PostgreSQL custom-format dumps (`pg_dump -Fc`) of the `nlol_db` database,
stored on local disk under `backups/` (see `BACKUP_DIR` in `nlol_wms/settings.py`).

They can be triggered two ways, both going through the same
`accounts/management/commands/backup_database.py` command and recorded as a
`BackupJob` row:

- **Manually** — via the "Back Up Now" button on the Backup & Restore page
  (superadmin only), or directly from the CLI:
  ```
  python manage.py backup_database --trigger=manual --user-id=<id>
  ```
- **On a schedule** — via Windows Task Scheduler running `scripts/run_scheduled_backup.bat`,
  registered to run **weekly** (every Sunday at 02:00). One-time setup — run in an
  **Administrator PowerShell** window:
  ```powershell
  $action   = New-ScheduledTaskAction -Execute "C:\NLOL WMS\scripts\run_scheduled_backup.bat"
  $trigger  = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At 2:00AM
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable
  Register-ScheduledTask -TaskName "NLOL WMS DB Backup" -Action $action -Trigger $trigger -Settings $settings -RunLevel Highest
  ```
  The `-StartWhenAvailable` setting matters on a machine that isn't always on: if the
  scheduled time passes while the system is off or asleep, Task Scheduler runs the
  backup automatically the next time the machine is turned on, instead of silently
  skipping it. (Plain `schtasks /create` has no flag for this — that's why the
  PowerShell `ScheduledTasks` module is used instead.)

  To adjust the day/time later, change `-DaysOfWeek` / `-At` and re-run
  `Register-ScheduledTask ... -Force`, or edit the task in Task Scheduler's GUI.

The most recent `BACKUP_RETENTION_COUNT` successful backups are kept; older ones
are pruned automatically (file + history row) after each successful run.

Requires the PostgreSQL client tools (`pg_dump`, `pg_restore`) to be installed and
on `PATH` — they ship with the standard PostgreSQL installer.

## ⚠️ Important — the encryption key is NOT in the database

Recipe data is encrypted at the application level using `RECIPE_ENCRYPTION_KEY`,
which lives in `nlol_wms/settings.py`, **not** in the database. A database backup
alone is **not** sufficient to make encrypted recipe data readable again later.

**Whenever you take or rely on a backup, also keep a secure copy of the current
value of `RECIPE_ENCRYPTION_KEY` from `settings.py` from that point in time.**
Without the matching key, encrypted recipe rows in a restored database cannot be
decrypted.

## Restore (manual process — there is no "Restore" button in the UI)

Restoring overwrites live data and is intentionally a guarded, manual/CLI process:

1. **Stop the application** (or put it in maintenance mode) so nothing writes to
   the database during the restore.
2. Run the restore against the target database:
   ```
   pg_restore --clean --if-exists -d nlol_db <path-to-backup>.dump
   ```
3. **Restore the matching `RECIPE_ENCRYPTION_KEY` value into `nlol_wms/settings.py`**
   — the one that was active when this backup was taken — *before* restarting the
   app. If the key doesn't match, encrypted recipe data will fail to decrypt.
4. Run migrations to reconcile the schema if you're restoring across app versions:
   ```
   python manage.py migrate
   ```
5. Restart the application and verify the data (including a recipe page, to confirm
   decryption works).
