BEGIN;

CREATE TABLE IF NOT EXISTS user_account (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username varchar(64) NOT NULL,
  password_hash varchar(255) NOT NULL,
  account_type varchar(32) NOT NULL DEFAULT 'student',
  display_name varchar(80) NOT NULL,
  student_no varchar(64),
  class_name varchar(80),
  status varchar(32) NOT NULL DEFAULT 'active',
  failed_login_count integer NOT NULL DEFAULT 0,
  locked_until TIMESTAMP(3) WITH TIME ZONE,
  must_change_password boolean NOT NULL DEFAULT false,
  last_login_at TIMESTAMP(3) WITH TIME ZONE,
  _created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile DEFAULT (
    CASE
      WHEN current_setting('app.user_id', TRUE) = '' THEN NULL
      ELSE concat('(', current_setting('app.user_id', TRUE), ')')::user_profile
    END
  ),
  _updated_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile DEFAULT (
    CASE
      WHEN current_setting('app.user_id', TRUE) = '' THEN NULL
      ELSE concat('(', current_setting('app.user_id', TRUE), ')')::user_profile
    END
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_user_account_username
  ON user_account (lower(username));
CREATE INDEX IF NOT EXISTS idx_user_account_type_status
  ON user_account (account_type, status);

CREATE TABLE IF NOT EXISTS user_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES user_account(id) ON DELETE CASCADE,
  token_hash varchar(128) NOT NULL,
  expires_at TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  revoked_at TIMESTAMP(3) WITH TIME ZONE,
  last_seen_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_agent text,
  ip_address varchar(64),
  _created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile DEFAULT (
    CASE
      WHEN current_setting('app.user_id', TRUE) = '' THEN NULL
      ELSE concat('(', current_setting('app.user_id', TRUE), ')')::user_profile
    END
  ),
  _updated_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile DEFAULT (
    CASE
      WHEN current_setting('app.user_id', TRUE) = '' THEN NULL
      ELSE concat('(', current_setting('app.user_id', TRUE), ')')::user_profile
    END
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_user_session_token_hash
  ON user_session (token_hash);
CREATE INDEX IF NOT EXISTS idx_user_session_account_expiry
  ON user_session (account_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS lesson (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug varchar(80) NOT NULL,
  title varchar(100) NOT NULL,
  grade_label varchar(80),
  full_text text NOT NULL,
  pinyin_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  rubric_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  revision integer NOT NULL DEFAULT 1,
  status varchar(32) NOT NULL DEFAULT 'published',
  cover_url text,
  full_demo_url text,
  video_template_url text,
  _created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile DEFAULT (
    CASE
      WHEN current_setting('app.user_id', TRUE) = '' THEN NULL
      ELSE concat('(', current_setting('app.user_id', TRUE), ')')::user_profile
    END
  ),
  _updated_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile DEFAULT (
    CASE
      WHEN current_setting('app.user_id', TRUE) = '' THEN NULL
      ELSE concat('(', current_setting('app.user_id', TRUE), ')')::user_profile
    END
  )
);

COMMENT ON COLUMN lesson.pinyin_json IS '@type { paragraphs: string[] }';
COMMENT ON COLUMN lesson.rubric_json IS '@type { accuracyTargets: { char: string; reading: string }[]; natural: { kind: string; description: string }; delivery: { yiTargets: { label: string; tone: number; reading: string }[]; neutralTargets: string[] }; thresholds: { normalPhoneLevel: number; targetPhoneLevel: number } }';
CREATE UNIQUE INDEX IF NOT EXISTS uk_lesson_slug ON lesson (slug);
CREATE INDEX IF NOT EXISTS idx_lesson_status ON lesson (status);

CREATE TABLE IF NOT EXISTS lesson_page (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES lesson(id) ON DELETE CASCADE,
  page_no integer NOT NULL,
  page_type varchar(32) NOT NULL DEFAULT 'body',
  text_content text NOT NULL,
  pinyin_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  illustration_url text,
  demo_audio_url text,
  video_start_ms integer,
  video_end_ms integer,
  _created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile DEFAULT (
    CASE
      WHEN current_setting('app.user_id', TRUE) = '' THEN NULL
      ELSE concat('(', current_setting('app.user_id', TRUE), ')')::user_profile
    END
  ),
  _updated_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile DEFAULT (
    CASE
      WHEN current_setting('app.user_id', TRUE) = '' THEN NULL
      ELSE concat('(', current_setting('app.user_id', TRUE), ')')::user_profile
    END
  )
);

COMMENT ON COLUMN lesson_page.pinyin_json IS '@type { text: string; pinyin: string }[]';
CREATE UNIQUE INDEX IF NOT EXISTS uk_lesson_page_order
  ON lesson_page (lesson_id, page_no);

CREATE TABLE IF NOT EXISTS reading_attempt (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES user_account(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES lesson(id) ON DELETE RESTRICT,
  lesson_revision integer NOT NULL DEFAULT 1,
  recording_mode varchar(32) NOT NULL DEFAULT 'full_text',
  status varchar(32) NOT NULL DEFAULT 'recorded',
  audio_bucket_id varchar(128),
  audio_file_path text,
  audio_mime_type varchar(128),
  audio_duration_ms integer,
  recorded_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile DEFAULT (
    CASE
      WHEN current_setting('app.user_id', TRUE) = '' THEN NULL
      ELSE concat('(', current_setting('app.user_id', TRUE), ')')::user_profile
    END
  ),
  _updated_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile DEFAULT (
    CASE
      WHEN current_setting('app.user_id', TRUE) = '' THEN NULL
      ELSE concat('(', current_setting('app.user_id', TRUE), ')')::user_profile
    END
  )
);

CREATE INDEX IF NOT EXISTS idx_reading_attempt_student_lesson_time
  ON reading_attempt (student_id, lesson_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_reading_attempt_lesson_time
  ON reading_attempt (lesson_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS reading_clip (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES reading_attempt(id) ON DELETE CASCADE,
  lesson_page_id uuid REFERENCES lesson_page(id) ON DELETE SET NULL,
  sequence_no integer NOT NULL,
  clip_type varchar(32) NOT NULL DEFAULT 'body',
  audio_bucket_id varchar(128) NOT NULL,
  audio_file_path text NOT NULL,
  audio_mime_type varchar(128),
  audio_duration_ms integer,
  _created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile DEFAULT (
    CASE
      WHEN current_setting('app.user_id', TRUE) = '' THEN NULL
      ELSE concat('(', current_setting('app.user_id', TRUE), ')')::user_profile
    END
  ),
  _updated_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile DEFAULT (
    CASE
      WHEN current_setting('app.user_id', TRUE) = '' THEN NULL
      ELSE concat('(', current_setting('app.user_id', TRUE), ')')::user_profile
    END
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_reading_clip_attempt_sequence
  ON reading_clip (attempt_id, sequence_no);

CREATE TABLE IF NOT EXISTS reading_evaluation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES reading_attempt(id) ON DELETE CASCADE,
  version_no integer NOT NULL DEFAULT 1,
  provider varchar(32) NOT NULL DEFAULT 'xfyun',
  provider_sid varchar(128),
  algorithm_version varchar(64) NOT NULL,
  raw_xml text,
  total_score numeric(6, 2),
  accuracy_score numeric(6, 2),
  fluency_score numeric(6, 2),
  integrity_score numeric(6, 2),
  tone_score numeric(6, 2),
  accuracy_stars integer,
  natural_stars integer,
  delivery_stars integer,
  teacher_comment text,
  aligned boolean NOT NULL DEFAULT false,
  issue_count integer NOT NULL DEFAULT 0,
  report_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  evaluated_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile DEFAULT (
    CASE
      WHEN current_setting('app.user_id', TRUE) = '' THEN NULL
      ELSE concat('(', current_setting('app.user_id', TRUE), ')')::user_profile
    END
  ),
  _updated_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile DEFAULT (
    CASE
      WHEN current_setting('app.user_id', TRUE) = '' THEN NULL
      ELSE concat('(', current_setting('app.user_id', TRUE), ')')::user_profile
    END
  )
);

COMMENT ON COLUMN reading_evaluation.report_json IS '@type { scores: Record<string, number | null>; goals: Record<string, unknown>; issues: { position: number | null; length: number; word: string; labels: string[]; start: number; end: number }[]; segments: { sentence: string; start: number; end: number }[]; words: unknown[]; aligned: boolean }';
CREATE UNIQUE INDEX IF NOT EXISTS uk_reading_evaluation_attempt_version
  ON reading_evaluation (attempt_id, version_no);
CREATE INDEX IF NOT EXISTS idx_reading_evaluation_dimension_stars
  ON reading_evaluation (accuracy_stars, natural_stars, delivery_stars);

CREATE TABLE IF NOT EXISTS student_lesson_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES user_account(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES lesson(id) ON DELETE CASCADE,
  latest_attempt_id uuid REFERENCES reading_attempt(id) ON DELETE SET NULL,
  latest_evaluation_id uuid REFERENCES reading_evaluation(id) ON DELETE SET NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  last_practiced_at TIMESTAMP(3) WITH TIME ZONE,
  _created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile DEFAULT (
    CASE
      WHEN current_setting('app.user_id', TRUE) = '' THEN NULL
      ELSE concat('(', current_setting('app.user_id', TRUE), ')')::user_profile
    END
  ),
  _updated_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile DEFAULT (
    CASE
      WHEN current_setting('app.user_id', TRUE) = '' THEN NULL
      ELSE concat('(', current_setting('app.user_id', TRUE), ')')::user_profile
    END
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_student_lesson_progress
  ON student_lesson_progress (student_id, lesson_id);
CREATE INDEX IF NOT EXISTS idx_student_lesson_progress_recent
  ON student_lesson_progress (last_practiced_at DESC);

ALTER TABLE user_account ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_page ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_attempt ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_clip ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_evaluation ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_lesson_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_bypass_policy ON user_account TO service_role USING (true);
CREATE POLICY "修改全部数据" ON user_account AS PERMISSIVE FOR ALL TO authenticated_workspace_aadkzyrawxcew USING (true) WITH CHECK (true);
CREATE POLICY "查看全部数据" ON user_account AS PERMISSIVE FOR SELECT TO authenticated_workspace_aadkzyrawxcew, authenticated, anon USING (true);
CREATE POLICY "修改本人数据" ON user_account AS PERMISSIVE FOR ALL TO authenticated_workspace_aadkzyrawxcew USING (true) WITH CHECK (true);

CREATE POLICY service_role_bypass_policy ON user_session TO service_role USING (true);
CREATE POLICY "修改全部数据" ON user_session AS PERMISSIVE FOR ALL TO authenticated_workspace_aadkzyrawxcew USING (true) WITH CHECK (true);
CREATE POLICY "查看全部数据" ON user_session AS PERMISSIVE FOR SELECT TO authenticated_workspace_aadkzyrawxcew, authenticated, anon USING (true);
CREATE POLICY "修改本人数据" ON user_session AS PERMISSIVE FOR ALL TO authenticated_workspace_aadkzyrawxcew USING (true) WITH CHECK (true);

CREATE POLICY service_role_bypass_policy ON lesson TO service_role USING (true);
CREATE POLICY "修改全部数据" ON lesson AS PERMISSIVE FOR ALL TO authenticated_workspace_aadkzyrawxcew USING (true) WITH CHECK (true);
CREATE POLICY "查看全部数据" ON lesson AS PERMISSIVE FOR SELECT TO authenticated_workspace_aadkzyrawxcew, authenticated, anon USING (true);
CREATE POLICY "修改本人数据" ON lesson AS PERMISSIVE FOR ALL TO authenticated_workspace_aadkzyrawxcew USING (true) WITH CHECK (true);

CREATE POLICY service_role_bypass_policy ON lesson_page TO service_role USING (true);
CREATE POLICY "修改全部数据" ON lesson_page AS PERMISSIVE FOR ALL TO authenticated_workspace_aadkzyrawxcew USING (true) WITH CHECK (true);
CREATE POLICY "查看全部数据" ON lesson_page AS PERMISSIVE FOR SELECT TO authenticated_workspace_aadkzyrawxcew, authenticated, anon USING (true);
CREATE POLICY "修改本人数据" ON lesson_page AS PERMISSIVE FOR ALL TO authenticated_workspace_aadkzyrawxcew USING (true) WITH CHECK (true);

CREATE POLICY service_role_bypass_policy ON reading_attempt TO service_role USING (true);
CREATE POLICY "修改全部数据" ON reading_attempt AS PERMISSIVE FOR ALL TO authenticated_workspace_aadkzyrawxcew USING (true) WITH CHECK (true);
CREATE POLICY "查看全部数据" ON reading_attempt AS PERMISSIVE FOR SELECT TO authenticated_workspace_aadkzyrawxcew, authenticated, anon USING (true);
CREATE POLICY "修改本人数据" ON reading_attempt AS PERMISSIVE FOR ALL TO authenticated_workspace_aadkzyrawxcew USING (true) WITH CHECK (true);

CREATE POLICY service_role_bypass_policy ON reading_clip TO service_role USING (true);
CREATE POLICY "修改全部数据" ON reading_clip AS PERMISSIVE FOR ALL TO authenticated_workspace_aadkzyrawxcew USING (true) WITH CHECK (true);
CREATE POLICY "查看全部数据" ON reading_clip AS PERMISSIVE FOR SELECT TO authenticated_workspace_aadkzyrawxcew, authenticated, anon USING (true);
CREATE POLICY "修改本人数据" ON reading_clip AS PERMISSIVE FOR ALL TO authenticated_workspace_aadkzyrawxcew USING (true) WITH CHECK (true);

CREATE POLICY service_role_bypass_policy ON reading_evaluation TO service_role USING (true);
CREATE POLICY "修改全部数据" ON reading_evaluation AS PERMISSIVE FOR ALL TO authenticated_workspace_aadkzyrawxcew USING (true) WITH CHECK (true);
CREATE POLICY "查看全部数据" ON reading_evaluation AS PERMISSIVE FOR SELECT TO authenticated_workspace_aadkzyrawxcew, authenticated, anon USING (true);
CREATE POLICY "修改本人数据" ON reading_evaluation AS PERMISSIVE FOR ALL TO authenticated_workspace_aadkzyrawxcew USING (true) WITH CHECK (true);

CREATE POLICY service_role_bypass_policy ON student_lesson_progress TO service_role USING (true);
CREATE POLICY "修改全部数据" ON student_lesson_progress AS PERMISSIVE FOR ALL TO authenticated_workspace_aadkzyrawxcew USING (true) WITH CHECK (true);
CREATE POLICY "查看全部数据" ON student_lesson_progress AS PERMISSIVE FOR SELECT TO authenticated_workspace_aadkzyrawxcew, authenticated, anon USING (true);
CREATE POLICY "修改本人数据" ON student_lesson_progress AS PERMISSIVE FOR ALL TO authenticated_workspace_aadkzyrawxcew USING (true) WITH CHECK (true);

COMMIT;
