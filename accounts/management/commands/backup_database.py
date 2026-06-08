import os
import subprocess
from datetime import datetime

from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone

from accounts.models import BackupJob, User


class Command(BaseCommand):
    help = 'Dump the database to a compressed pg_dump file and track the job in BackupJob'

    def add_arguments(self, parser):
        parser.add_argument('--trigger', choices=['manual', 'scheduled'], default='scheduled')
        parser.add_argument('--user-id', type=int, default=None)
        parser.add_argument('--job-id', type=int, default=None,
                            help='Reuse an already-created BackupJob row instead of creating a new one (used by the API so it can return an id to poll immediately).')

    def handle(self, *args, **options):
        trigger = options['trigger']
        user = None
        if options['user_id']:
            user = User.objects.filter(pk=options['user_id']).first()

        if options['job_id']:
            job = BackupJob.objects.get(pk=options['job_id'])
        else:
            job = BackupJob.objects.create(trigger=trigger, status='running', triggered_by=user)

        try:
            file_path = self._run_dump(job)
            job.status = 'success'
            job.file_name = os.path.basename(file_path)
            job.file_size = os.path.getsize(file_path)
            job.completed_at = timezone.now()
            job.save(update_fields=['status', 'file_name', 'file_size', 'completed_at'])
            self.stdout.write(self.style.SUCCESS(f'Backup OK: {job.file_name} ({job.file_size} bytes)'))
            self._enforce_retention()
        except Exception as e:
            job.status = 'failed'
            job.error_message = str(e)
            job.completed_at = timezone.now()
            job.save(update_fields=['status', 'error_message', 'completed_at'])
            self.stderr.write(self.style.ERROR(f'Backup failed: {e}'))
            raise

    def _run_dump(self, job):
        db = settings.DATABASES['default']
        os.makedirs(settings.BACKUP_DIR, exist_ok=True)

        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        file_name = f'nlol_backup_{timestamp}.dump'
        file_path = os.path.join(settings.BACKUP_DIR, file_name)

        env = os.environ.copy()
        if db.get('PASSWORD'):
            env['PGPASSWORD'] = db['PASSWORD']

        cmd = [
            'pg_dump',
            '-Fc',
            '-h', db.get('HOST') or 'localhost',
            '-p', str(db.get('PORT') or '5432'),
            '-U', db.get('USER') or 'postgres',
            '-f', file_path,
            db['NAME'],
        ]

        result = subprocess.run(cmd, env=env, capture_output=True, text=True)
        if result.returncode != 0:
            if os.path.exists(file_path):
                os.remove(file_path)
            raise RuntimeError(result.stderr.strip() or 'pg_dump exited with a non-zero status')

        return file_path

    def _enforce_retention(self):
        keep = settings.BACKUP_RETENTION_COUNT
        stale_jobs = BackupJob.objects.filter(status='success').order_by('-started_at')[keep:]
        for job in stale_jobs:
            file_path = os.path.join(settings.BACKUP_DIR, job.file_name)
            if job.file_name and os.path.exists(file_path):
                os.remove(file_path)
            job.delete()
