-- Every account receives a human-readable unique username, including legacy accounts.
-- Serialize name allocation with profile edits; never use account IDs or random IDs as handles.
CREATE OR REPLACE FUNCTION cabo_ensure_profile(account_id TEXT) RETURNS VOID AS $$
DECLARE existing_name TEXT; person_name TEXT; base TEXT; candidate TEXT; suffix INTEGER := 1;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('cabo-profile-username-allocation'));
  SELECT p.username INTO existing_name FROM "Profile" p WHERE p."userId"=account_id;
  IF existing_name ~ '^[a-z0-9_]{3,24}$' THEN RETURN; END IF;
  SELECT COALESCE(NULLIF(trim(name),''),'Player') INTO person_name FROM "User" WHERE id=account_id;
  IF person_name IS NULL THEN RETURN; END IF;
  base := trim(both '_' FROM regexp_replace(lower(COALESCE(NULLIF(existing_name,''),person_name)), '[^a-z0-9_]+', '_', 'g'));
  IF length(base)<3 THEN base := CASE WHEN length(base)>0 THEN base||'_player' ELSE 'player' END; END IF;
  base := left(base,20); candidate := base;
  WHILE EXISTS(SELECT 1 FROM "Profile" WHERE lower(username)=candidate AND "userId"<>account_id) LOOP
    suffix := suffix+1; candidate := left(base,24-length(suffix::text))||suffix::text;
  END LOOP;
  INSERT INTO "Profile" ("userId",username,"displayName","presenceVisible","lastSeen",online)
  VALUES(account_id,candidate,left(person_name,40),true,CURRENT_TIMESTAMP,false)
  ON CONFLICT("userId") DO UPDATE SET username=EXCLUDED.username;
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION cabo_provision_profile() RETURNS TRIGGER AS $$
BEGIN PERFORM cabo_ensure_profile(NEW.id); RETURN NEW; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER cabo_user_profile AFTER INSERT ON "User" FOR EACH ROW EXECUTE FUNCTION cabo_provision_profile();
DO $$ DECLARE account RECORD; BEGIN
  FOR account IN SELECT id FROM "User" ORDER BY "createdAt",id LOOP PERFORM cabo_ensure_profile(account.id); END LOOP;
END $$;
CREATE UNIQUE INDEX "Profile_username_casefold_key" ON "Profile" (lower(username));
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_username_format" CHECK (username ~ '^[a-z0-9_]{3,24}$');
ALTER TABLE "Notification" ADD COLUMN "actorId" TEXT;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"(id) ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Notification_actorId_idx" ON "Notification"("actorId");
