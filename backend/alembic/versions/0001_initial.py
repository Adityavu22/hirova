"""Initial career portal schema."""

import sqlalchemy as sa

from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    """1. Create the normalized PostgreSQL-ready core schema."""

    op.create_table("candidates", sa.Column("id", sa.String(36), primary_key=True), sa.Column("name", sa.String(120), nullable=False), sa.Column("email", sa.String(255), nullable=False), sa.Column("headline", sa.String(255)), sa.Column("skills", sa.JSON(), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()))
    op.create_index("ix_candidates_email", "candidates", ["email"], unique=True)
    op.create_table("jobs", sa.Column("id", sa.String(36), primary_key=True), sa.Column("external_id", sa.String(100), nullable=False), sa.Column("title", sa.String(180), nullable=False), sa.Column("company", sa.String(180), nullable=False), sa.Column("location", sa.String(180), nullable=False), sa.Column("work_mode", sa.String(40), nullable=False), sa.Column("salary_min", sa.Float()), sa.Column("salary_max", sa.Float()), sa.Column("description", sa.Text(), nullable=False), sa.Column("skills", sa.JSON(), nullable=False), sa.Column("seniority", sa.String(80), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()))
    op.create_index("ix_jobs_external_id", "jobs", ["external_id"], unique=True)
    op.create_index("ix_jobs_title", "jobs", ["title"])
    op.create_index("ix_jobs_company", "jobs", ["company"])
    op.create_index("ix_jobs_location", "jobs", ["location"])
    op.create_table("resumes", sa.Column("id", sa.String(36), primary_key=True), sa.Column("candidate_id", sa.String(36), sa.ForeignKey("candidates.id", ondelete="CASCADE"), nullable=False), sa.Column("filename", sa.String(255), nullable=False), sa.Column("content_text", sa.Text(), nullable=False), sa.Column("structured_data", sa.JSON(), nullable=False), sa.Column("score", sa.Float()), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()))
    op.create_index("ix_resumes_candidate_id", "resumes", ["candidate_id"])
    op.create_table("matches", sa.Column("id", sa.String(36), primary_key=True), sa.Column("candidate_id", sa.String(36), sa.ForeignKey("candidates.id", ondelete="CASCADE"), nullable=False), sa.Column("job_id", sa.String(36), sa.ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False), sa.Column("score", sa.Float(), nullable=False), sa.Column("explanation", sa.JSON(), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()))
    op.create_index("ix_matches_candidate_id", "matches", ["candidate_id"])
    op.create_index("ix_matches_job_id", "matches", ["job_id"])


def downgrade() -> None:
    """2. Reverse in dependency order."""

    op.drop_table("matches")
    op.drop_table("resumes")
    op.drop_table("jobs")
    op.drop_table("candidates")
