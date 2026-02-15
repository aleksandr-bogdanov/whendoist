"""
Snapshot service for automated export backups.

Creates, lists, deduplicates, and manages gzip-compressed JSON snapshots
of user data. Content-hash deduplication ensures inactive users generate
zero additional storage.
"""

import gzip
import hashlib
import json
import logging
from datetime import datetime
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ExportSnapshot
from app.services.backup_service import BackupService

logger = logging.getLogger("whendoist.snapshots")


class SnapshotService:
    """Async service for export snapshot operations."""

    def __init__(self, db: AsyncSession, user_id: int):
        self.db = db
        self.user_id = user_id

    async def create_snapshot(self, is_manual: bool = False) -> ExportSnapshot | None:
        """
        Create a new snapshot from current user data.

        Uses content-hash deduplication: automatic snapshots are skipped
        if data hasn't changed since the last snapshot. Manual snapshots
        always create a new entry.

        Returns the snapshot if created, or None if skipped (dedup).
        """
        backup_service = BackupService(self.db, self.user_id)
        data = await backup_service.export_all()

        # Compute deterministic hash excluding volatile fields
        hash_data = {k: v for k, v in data.items() if k not in ("exported_at", "version")}
        hash_json = json.dumps(hash_data, separators=(",", ":"), sort_keys=True, ensure_ascii=False).encode()
        content_hash = hashlib.sha256(hash_json).hexdigest()

        # Dedup check: skip if hash matches latest (unless manual)
        if not is_manual:
            latest_hash = await self._get_latest_hash()
            if latest_hash == content_hash:
                return None

        # Compress full data (including exported_at/version)
        full_json = json.dumps(data, separators=(",", ":"), sort_keys=True, ensure_ascii=False).encode()
        compressed = gzip.compress(full_json)

        snapshot = ExportSnapshot(
            user_id=self.user_id,
            data=compressed,
            content_hash=content_hash,
            size_bytes=len(compressed),
            is_manual=is_manual,
        )
        self.db.add(snapshot)
        await self.db.flush()

        return snapshot

    async def list_snapshots(self) -> list[Any]:
        """
        List all snapshots for the user, newest first.

        Returns column-level select results (no data blob) for efficiency.
        """
        result = await self.db.execute(
            select(
                ExportSnapshot.id,
                ExportSnapshot.content_hash,
                ExportSnapshot.size_bytes,
                ExportSnapshot.is_manual,
                ExportSnapshot.created_at,
            )
            .where(ExportSnapshot.user_id == self.user_id)
            .order_by(ExportSnapshot.created_at.desc())
        )
        return list(result.all())

    async def get_snapshot_data(self, snapshot_id: int) -> dict[str, Any] | None:
        """
        Get decompressed snapshot data, enforcing user_id ownership.

        Returns parsed JSON dict or None if not found/not owned.
        """
        result = await self.db.execute(
            select(ExportSnapshot.data).where(
                ExportSnapshot.id == snapshot_id,
                ExportSnapshot.user_id == self.user_id,
            )
        )
        row = result.scalar_one_or_none()
        if row is None:
            return None

        decompressed = gzip.decompress(row)
        return json.loads(decompressed)

    async def delete_snapshot(self, snapshot_id: int) -> bool:
        """
        Delete a single snapshot, enforcing user_id ownership.

        Returns True if deleted, False if not found/not owned.
        """
        result = await self.db.execute(
            delete(ExportSnapshot).where(
                ExportSnapshot.id == snapshot_id,
                ExportSnapshot.user_id == self.user_id,
            )
        )
        return (result.rowcount or 0) > 0  # type: ignore[union-attr]

    async def enforce_retention(self, retain_count: int) -> int:
        """
        Delete oldest snapshots beyond the retention limit.

        Returns count of deleted snapshots.
        """
        # Get IDs to keep (newest N)
        keep_result = await self.db.execute(
            select(ExportSnapshot.id)
            .where(ExportSnapshot.user_id == self.user_id)
            .order_by(ExportSnapshot.created_at.desc())
            .limit(retain_count)
        )
        keep_ids = [row[0] for row in keep_result.all()]

        if not keep_ids:
            return 0

        # Delete everything not in the keep list
        result = await self.db.execute(
            delete(ExportSnapshot).where(
                ExportSnapshot.user_id == self.user_id,
                ExportSnapshot.id.notin_(keep_ids),
            )
        )
        return result.rowcount or 0  # type: ignore[union-attr]

    async def get_latest_snapshot_time(self) -> datetime | None:
        """Get the creation time of the most recent snapshot."""
        result = await self.db.execute(
            select(ExportSnapshot.created_at)
            .where(ExportSnapshot.user_id == self.user_id)
            .order_by(ExportSnapshot.created_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def _get_latest_hash(self) -> str | None:
        """Get the content hash of the most recent snapshot."""
        result = await self.db.execute(
            select(ExportSnapshot.content_hash)
            .where(ExportSnapshot.user_id == self.user_id)
            .order_by(ExportSnapshot.created_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()
