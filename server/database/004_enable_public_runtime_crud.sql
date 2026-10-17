BEGIN;

ALTER POLICY "修改全部数据" ON user_account
  TO authenticated_workspace_aadkzyrawxcew, anon_workspace_aadkzyrawxcew
  USING (true) WITH CHECK (true);
ALTER POLICY "查看全部数据" ON user_account
  TO authenticated_workspace_aadkzyrawxcew, anon_workspace_aadkzyrawxcew,
    authenticated, anon USING (true);
ALTER POLICY "修改本人数据" ON user_account
  TO authenticated_workspace_aadkzyrawxcew, anon_workspace_aadkzyrawxcew
  USING (true) WITH CHECK (true);

ALTER POLICY "修改全部数据" ON user_session
  TO authenticated_workspace_aadkzyrawxcew, anon_workspace_aadkzyrawxcew
  USING (true) WITH CHECK (true);
ALTER POLICY "查看全部数据" ON user_session
  TO authenticated_workspace_aadkzyrawxcew, anon_workspace_aadkzyrawxcew,
    authenticated, anon USING (true);
ALTER POLICY "修改本人数据" ON user_session
  TO authenticated_workspace_aadkzyrawxcew, anon_workspace_aadkzyrawxcew
  USING (true) WITH CHECK (true);

ALTER POLICY "修改全部数据" ON lesson
  TO authenticated_workspace_aadkzyrawxcew, anon_workspace_aadkzyrawxcew
  USING (true) WITH CHECK (true);
ALTER POLICY "查看全部数据" ON lesson
  TO authenticated_workspace_aadkzyrawxcew, anon_workspace_aadkzyrawxcew,
    authenticated, anon USING (true);
ALTER POLICY "修改本人数据" ON lesson
  TO authenticated_workspace_aadkzyrawxcew, anon_workspace_aadkzyrawxcew
  USING (true) WITH CHECK (true);

ALTER POLICY "修改全部数据" ON lesson_page
  TO authenticated_workspace_aadkzyrawxcew, anon_workspace_aadkzyrawxcew
  USING (true) WITH CHECK (true);
ALTER POLICY "查看全部数据" ON lesson_page
  TO authenticated_workspace_aadkzyrawxcew, anon_workspace_aadkzyrawxcew,
    authenticated, anon USING (true);
ALTER POLICY "修改本人数据" ON lesson_page
  TO authenticated_workspace_aadkzyrawxcew, anon_workspace_aadkzyrawxcew
  USING (true) WITH CHECK (true);

ALTER POLICY "修改全部数据" ON reading_attempt
  TO authenticated_workspace_aadkzyrawxcew, anon_workspace_aadkzyrawxcew
  USING (true) WITH CHECK (true);
ALTER POLICY "查看全部数据" ON reading_attempt
  TO authenticated_workspace_aadkzyrawxcew, anon_workspace_aadkzyrawxcew,
    authenticated, anon USING (true);
ALTER POLICY "修改本人数据" ON reading_attempt
  TO authenticated_workspace_aadkzyrawxcew, anon_workspace_aadkzyrawxcew
  USING (true) WITH CHECK (true);

ALTER POLICY "修改全部数据" ON reading_clip
  TO authenticated_workspace_aadkzyrawxcew, anon_workspace_aadkzyrawxcew
  USING (true) WITH CHECK (true);
ALTER POLICY "查看全部数据" ON reading_clip
  TO authenticated_workspace_aadkzyrawxcew, anon_workspace_aadkzyrawxcew,
    authenticated, anon USING (true);
ALTER POLICY "修改本人数据" ON reading_clip
  TO authenticated_workspace_aadkzyrawxcew, anon_workspace_aadkzyrawxcew
  USING (true) WITH CHECK (true);

ALTER POLICY "修改全部数据" ON reading_evaluation
  TO authenticated_workspace_aadkzyrawxcew, anon_workspace_aadkzyrawxcew
  USING (true) WITH CHECK (true);
ALTER POLICY "查看全部数据" ON reading_evaluation
  TO authenticated_workspace_aadkzyrawxcew, anon_workspace_aadkzyrawxcew,
    authenticated, anon USING (true);
ALTER POLICY "修改本人数据" ON reading_evaluation
  TO authenticated_workspace_aadkzyrawxcew, anon_workspace_aadkzyrawxcew
  USING (true) WITH CHECK (true);

ALTER POLICY "修改全部数据" ON student_lesson_progress
  TO authenticated_workspace_aadkzyrawxcew, anon_workspace_aadkzyrawxcew
  USING (true) WITH CHECK (true);
ALTER POLICY "查看全部数据" ON student_lesson_progress
  TO authenticated_workspace_aadkzyrawxcew, anon_workspace_aadkzyrawxcew,
    authenticated, anon USING (true);
ALTER POLICY "修改本人数据" ON student_lesson_progress
  TO authenticated_workspace_aadkzyrawxcew, anon_workspace_aadkzyrawxcew
  USING (true) WITH CHECK (true);

COMMIT;
