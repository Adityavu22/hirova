"""Add authenticated candidate workspace tables."""

import sqlalchemy as sa

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """1. Add profile, saved-job, and application persistence."""

    op.create_table(
        "candidate_workspace_profiles",
        sa.Column("candidate_id", sa.String(36), sa.ForeignKey("candidates.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("data", sa.JSON(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "saved_jobs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("candidate_id", sa.String(36), sa.ForeignKey("candidates.id", ondelete="CASCADE"), nullable=False),
        sa.Column("external_job_id", sa.String(100), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("candidate_id", "external_job_id", name="uq_saved_candidate_job"),
    )
    op.create_index("ix_saved_jobs_candidate_id", "saved_jobs", ["candidate_id"])
    op.create_index("ix_saved_jobs_external_job_id", "saved_jobs", ["external_job_id"])
    op.create_table(
        "applications",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("candidate_id", sa.String(36), sa.ForeignKey("candidates.id", ondelete="CASCADE"), nullable=False),
        sa.Column("external_job_id", sa.String(100), nullable=False),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("note", sa.Text(), nullable=False),
        sa.Column("applied_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("candidate_id", "external_job_id", name="uq_application_candidate_job"),
    )
    op.create_index("ix_applications_candidate_id", "applications", ["candidate_id"])
    op.create_index("ix_applications_external_job_id", "applications", ["external_job_id"])


def downgrade() -> None:
    """2. Remove workspace tables in dependency order."""

    op.drop_table("applications")
    op.drop_table("saved_jobs")
    op.drop_table("candidate_workspace_profiles")
