--
-- PostgreSQL database dump
--

-- Dumped from database version 11.13 (Debian 11.13-1.pgdg90+1)
-- Dumped by pg_dump version 11.13 (Debian 11.13-1.pgdg90+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: 
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: 
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: enum_experiment_strategies_strategy; Type: TYPE; Schema: public; Owner: retool_internal_user
--

CREATE TYPE public.enum_experiment_strategies_strategy AS ENUM (
    'percent_organizations',
    'percent_users',
    'email_domain',
    'organization',
    'user'
);


ALTER TYPE public.enum_experiment_strategies_strategy OWNER TO retool_internal_user;

--
-- Name: enum_notification_applications_platform; Type: TYPE; Schema: public; Owner: retool_internal_user
--

CREATE TYPE public.enum_notification_applications_platform AS ENUM (
    'APNS_SANDBOX',
    'APNS',
    'FCM',
    'WEB'
);


ALTER TYPE public.enum_notification_applications_platform OWNER TO retool_internal_user;

--
-- Name: enum_notification_subscribed_devices_transportType; Type: TYPE; Schema: public; Owner: retool_internal_user
--

CREATE TYPE public."enum_notification_subscribed_devices_transportType" AS ENUM (
    'MOBILE_PUSH',
    'WEBSOCKET'
);


ALTER TYPE public."enum_notification_subscribed_devices_transportType" OWNER TO retool_internal_user;

--
-- Name: enum_user_invite_suggestions_status; Type: TYPE; Schema: public; Owner: retool_internal_user
--

CREATE TYPE public.enum_user_invite_suggestions_status AS ENUM (
    'PENDING',
    'APPROVED',
    'DENIED'
);


ALTER TYPE public.enum_user_invite_suggestions_status OWNER TO retool_internal_user;

--
-- Name: exactly_one_default_environment_exists_before_delete(); Type: FUNCTION; Schema: public; Owner: retool_internal_user
--

CREATE FUNCTION public.exactly_one_default_environment_exists_before_delete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
      DECLARE exactly_one_default_environment_left BOOL;

      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM   organizations
          WHERE  organizations."id" = OLD."organizationId"
        )
        THEN
          RETURN OLD;
        END IF;

        exactly_one_default_environment_left := (
          SELECT COUNT(1) = 1
          FROM environments
          WHERE environments."organizationId" = OLD."organizationId"
          AND environments."id" != OLD."id"
          AND environments."isDefault" = TRUE
        );
        IF NOT exactly_one_default_environment_left THEN
          RAISE EXCEPTION 'Exactly one environment with isDefault = TRUE must exist';
        END IF;
        
        RETURN OLD;
      END; $$;


ALTER FUNCTION public.exactly_one_default_environment_exists_before_delete() OWNER TO retool_internal_user;

--
-- Name: update_users_last_active_trigger(); Type: FUNCTION; Schema: public; Owner: retool_internal_user
--

CREATE FUNCTION public.update_users_last_active_trigger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE users SET "lastActive" = now()
  WHERE users.id = NEW."userId";
  RETURN NEW;
END; $$;


ALTER FUNCTION public.update_users_last_active_trigger() OWNER TO retool_internal_user;

--
-- Name: validate_group_pages_trigger(); Type: FUNCTION; Schema: public; Owner: retool_internal_user
--

CREATE FUNCTION public.validate_group_pages_trigger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE valid_group_page bool;
BEGIN
  valid_group_page := (
    SELECT groupOrgId."organizationId" = pageOrgId."organizationId"
    FROM (
      SELECT "organizationId" FROM groups WHERE groups.id = NEW."groupId"
    ) groupOrgId, (
      SELECT "organizationId" FROM pages WHERE pages.id = NEW."pageId"
    ) pageOrgId
  );
  IF NOT valid_group_page THEN
    RAISE EXCEPTION 'Group % and Page % must belong to the same organization', NEW."groupId", NEW."pageId";
  END IF;

  IF NOT NEW."accessLevel" IN ('own', 'write', 'read') THEN
    RAISE EXCEPTION 'Access level % must be either "own", "write", or "read"', NEW."accessLevel";
  END IF;

  RETURN NEW;
END; $$;


ALTER FUNCTION public.validate_group_pages_trigger() OWNER TO retool_internal_user;

--
-- Name: validate_group_resources_trigger(); Type: FUNCTION; Schema: public; Owner: retool_internal_user
--

CREATE FUNCTION public.validate_group_resources_trigger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
      DECLARE valid_group_resource bool;
      BEGIN
        valid_group_resource := (
          SELECT groupOrgId."organizationId" = resourceOrgId."organizationId"
          FROM (
            SELECT "organizationId" FROM groups WHERE groups.id = NEW."groupId"
          ) groupOrgId, (
            SELECT "organizationId" FROM resources WHERE resources.id = NEW."resourceId"
          ) resourceOrgId
        );
        IF NOT valid_group_resource THEN
          RAISE EXCEPTION 'Group % and Resource % must belong to the same organization', NEW."groupId", NEW."resourceId";
        END IF;
        IF NOT NEW."accessLevel" IN ('own', 'read','write') THEN
          RAISE EXCEPTION 'Access level % must only be "read", "write" or "own"', NEW."accessLevel";
        END IF;
        RETURN NEW;
      END; $$;


ALTER FUNCTION public.validate_group_resources_trigger() OWNER TO retool_internal_user;

--
-- Name: validate_group_workflows_trigger(); Type: FUNCTION; Schema: public; Owner: retool_internal_user
--

CREATE FUNCTION public.validate_group_workflows_trigger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
        DECLARE valid_group_workflow bool;
        BEGIN
          valid_group_workflow := (
            SELECT groupOrgId."organizationId" = workflowOrgId."organizationId"
            FROM (
              SELECT "organizationId" FROM groups WHERE groups.id = NEW."groupId"
            ) groupOrgId, (
              SELECT "organizationId" FROM workflow WHERE workflow.id = NEW."workflowId"
            ) workflowOrgId
          );
          IF NOT valid_group_workflow THEN
            RAISE EXCEPTION 'Group % and Workflow % must belong to the same organization', NEW."groupId", NEW."workflowId";
          END IF;
          IF NOT NEW."accessLevel" IN ('own', 'write', 'read') THEN
            RAISE EXCEPTION 'Access level % must be in ("own", "write", "read")', NEW."accessLevel";
          END IF;
          RETURN NEW;
        END; $$;


ALTER FUNCTION public.validate_group_workflows_trigger() OWNER TO retool_internal_user;

--
-- Name: validate_pages_releasedtagid(); Type: FUNCTION; Schema: public; Owner: retool_internal_user
--

CREATE FUNCTION public.validate_pages_releasedtagid() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
  DECLARE valid_releasedTagId bool;
  BEGIN
    valid_releasedTagId := (
      SELECT (NEW."releasedTagId" IS NULL) OR isvalid.valid
      FROM (
        SELECT (COUNT(*) > 0) as valid
        FROM page_saves, tags
        WHERE NEW."id" = page_saves."pageId"
          AND tags."pageSaveId" = page_saves.id
          AND NEW."releasedTagId" = tags.id
      ) isvalid
    );
    IF NOT valid_releasedTagId THEN
      RAISE EXCEPTION 'Tag % must be for a save of page %', NEW."releasedTagId", NEW."id";
    END IF;
    RETURN NEW;
  END; $$;


ALTER FUNCTION public.validate_pages_releasedtagid() OWNER TO retool_internal_user;

--
-- Name: validate_release_workflowid(); Type: FUNCTION; Schema: public; Owner: retool_internal_user
--

CREATE FUNCTION public.validate_release_workflowid() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
        DECLARE
          validWorkflowId bool;
        BEGIN
          validWorkflowId := (SELECT workflow_save."workflowId" = NEW."workflowId" FROM workflow_save WHERE workflow_save.id = NEW."workflowSaveId");
          IF NOT validWorkflowId THEN
            RAISE EXCEPTION 'Release workflowId not equal to the workflowId of the save it belongs to';
          END IF;
          RETURN NEW;
        END; $$;


ALTER FUNCTION public.validate_release_workflowid() OWNER TO retool_internal_user;

--
-- Name: validate_tags_pageid(); Type: FUNCTION; Schema: public; Owner: retool_internal_user
--

CREATE FUNCTION public.validate_tags_pageid() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
  DECLARE
    validPageId bool;
  BEGIN
    validPageId := (SELECT page_saves."pageId" = NEW."pageId" FROM page_saves WHERE page_saves.id = NEW."pageSaveId");
    IF NOT validPageId THEN
      RAISE EXCEPTION 'Tag pageId not equal to the pageId of the save it belongs to';
    END IF;
    RETURN NEW;
  END; $$;


ALTER FUNCTION public.validate_tags_pageid() OWNER TO retool_internal_user;

--
-- Name: validate_user_groups_trigger(); Type: FUNCTION; Schema: public; Owner: retool_internal_user
--

CREATE FUNCTION public.validate_user_groups_trigger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE valid_user_group bool;
BEGIN
  valid_user_group := (
    SELECT groupOrgId."organizationId" = userOrgId."organizationId"
    FROM (
      SELECT "organizationId" FROM groups WHERE groups.id = NEW."groupId"
    ) groupOrgId, (
      SELECT "organizationId" FROM users WHERE users.id = NEW."userId"
    ) userOrgId
  );
  IF NOT valid_user_group THEN
    RAISE EXCEPTION 'Group % and User % must belong to the same organization', NEW."groupId", NEW."userId";
  END IF;
  RETURN NEW;
END; $$;


ALTER FUNCTION public.validate_user_groups_trigger() OWNER TO retool_internal_user;

--
-- Name: validate_user_invite_groups_trigger(); Type: FUNCTION; Schema: public; Owner: retool_internal_user
--

CREATE FUNCTION public.validate_user_invite_groups_trigger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE valid_user_invite_group bool;
BEGIN
  valid_user_invite_group := (
    SELECT groupOrgId."organizationId" = userInviteOrgId."organizationId"
    FROM (
      SELECT "organizationId" FROM groups WHERE groups.id = NEW."groupId"
    ) groupOrgId, (
      SELECT "organizationId" FROM user_invites WHERE user_invites.id = NEW."userInviteId"
    ) userInviteOrgId
  );
  IF NOT valid_user_invite_group THEN
    RAISE EXCEPTION 'Group % and UserInvitee % must belong to the same organization', NEW."groupId", NEW."userInviteId";
  END IF;
  RETURN NEW;
END; $$;


ALTER FUNCTION public.validate_user_invite_groups_trigger() OWNER TO retool_internal_user;

--
-- Name: validate_workflow_releaseid(); Type: FUNCTION; Schema: public; Owner: retool_internal_user
--

CREATE FUNCTION public.validate_workflow_releaseid() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
        DECLARE valid_releaseId bool;
        BEGIN
        valid_releaseId := (
            SELECT (NEW."releaseId" IS NULL) OR isvalid.valid
            FROM (
              SELECT (COUNT(*) > 0) as valid
              FROM workflow_save, workflow_release
              WHERE NEW."id" = workflow_save."workflowId"
                AND workflow_release."workflowSaveId" = workflow_save.id
                AND NEW."releaseId" = workflow_release.id
            ) isvalid
          );
          IF NOT valid_releaseId THEN
            RAISE EXCEPTION 'Release % must be for a save of workflow %', NEW."releaseId", NEW."id";
          END IF;
          RETURN NEW;
        END; $$;


ALTER FUNCTION public.validate_workflow_releaseid() OWNER TO retool_internal_user;

SET default_tablespace = '';

SET default_with_oids = false;

--
-- Name: SequelizeMeta; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public."SequelizeMeta" (
    name character varying(255) NOT NULL
);


ALTER TABLE public."SequelizeMeta" OWNER TO retool_internal_user;

--
-- Name: access_control_list_members; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.access_control_list_members (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "aclId" uuid NOT NULL,
    "memberType" character varying(255) NOT NULL,
    "memberId" character varying(255) NOT NULL,
    "reasonMetadata" character varying(255),
    "addedByUser" integer,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.access_control_list_members OWNER TO retool_internal_user;

--
-- Name: access_control_lists; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.access_control_lists (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "entityType" character varying(255) NOT NULL,
    "entityId" character varying(255) NOT NULL,
    "accessLevel" character varying(255) NOT NULL,
    "organizationId" integer NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.access_control_lists OWNER TO retool_internal_user;

--
-- Name: api_keys; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.api_keys (
    uuid uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    key text NOT NULL,
    "organizationId" integer NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


ALTER TABLE public.api_keys OWNER TO retool_internal_user;

--
-- Name: app_metadata; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.app_metadata (
    id integer NOT NULL,
    "pageId" integer,
    "pageSaveId" integer,
    "appVersion" text DEFAULT 'none'::text NOT NULL,
    height integer NOT NULL,
    width integer NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


ALTER TABLE public.app_metadata OWNER TO retool_internal_user;

--
-- Name: app_metadata_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.app_metadata_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.app_metadata_id_seq OWNER TO retool_internal_user;

--
-- Name: app_metadata_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.app_metadata_id_seq OWNED BY public.app_metadata.id;


--
-- Name: app_themes; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.app_themes (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    theme jsonb NOT NULL,
    organization_id integer,
    type character varying(255)
);


ALTER TABLE public.app_themes OWNER TO retool_internal_user;

--
-- Name: app_themes_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.app_themes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.app_themes_id_seq OWNER TO retool_internal_user;

--
-- Name: app_themes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.app_themes_id_seq OWNED BY public.app_themes.id;


--
-- Name: approval_task_executions; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.approval_task_executions (
    uuid uuid NOT NULL,
    "approvalTaskUuid" uuid NOT NULL,
    status text NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    CONSTRAINT check_status CHECK ((status = ANY (ARRAY['running'::text, 'success'::text, 'failure'::text])))
);


ALTER TABLE public.approval_task_executions OWNER TO retool_internal_user;

--
-- Name: approval_task_items; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.approval_task_items (
    uuid uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    key text NOT NULL,
    namespace text NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    data jsonb,
    metadata jsonb,
    "createdBy" integer NOT NULL,
    "organizationId" integer NOT NULL,
    "resourceName" text NOT NULL,
    finalized boolean DEFAULT false NOT NULL
);


ALTER TABLE public.approval_task_items OWNER TO retool_internal_user;

--
-- Name: approval_task_votes; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.approval_task_votes (
    uuid uuid NOT NULL,
    "approvalTaskUuid" uuid NOT NULL,
    choice text NOT NULL,
    data jsonb,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "userId" integer NOT NULL,
    CONSTRAINT check_choice CHECK ((choice = ANY (ARRAY['approve'::text, 'reject'::text])))
);


ALTER TABLE public.approval_task_votes OWNER TO retool_internal_user;

--
-- Name: appstore_tags; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.appstore_tags (
    uuid uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    description text NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.appstore_tags OWNER TO retool_internal_user;

--
-- Name: audit_trail_events; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.audit_trail_events (
    id integer NOT NULL,
    "userId" integer,
    "organizationId" integer,
    "userAgent" character varying(255),
    "ipAddress" character varying(255),
    "geoLocation" jsonb,
    "responseTimeMs" double precision,
    "actionType" character varying(255),
    "pageName" character varying(255),
    "queryName" character varying(255),
    "resourceName" character varying(255),
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    metadata jsonb
);


ALTER TABLE public.audit_trail_events OWNER TO retool_internal_user;

--
-- Name: audit_trail_events_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.audit_trail_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.audit_trail_events_id_seq OWNER TO retool_internal_user;

--
-- Name: audit_trail_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.audit_trail_events_id_seq OWNED BY public.audit_trail_events.id;


--
-- Name: bad_passwords; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.bad_passwords (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    password text NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.bad_passwords OWNER TO retool_internal_user;

--
-- Name: block_saves; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.block_saves (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "blockId" uuid,
    data jsonb NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


ALTER TABLE public.block_saves OWNER TO retool_internal_user;

--
-- Name: blocks; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.blocks (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    "organizationId" integer,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


ALTER TABLE public.blocks OWNER TO retool_internal_user;

--
-- Name: blueprints; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.blueprints (
    uuid uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "pageId" integer,
    "authorId" integer NOT NULL,
    "organizationId" integer NOT NULL,
    "displayName" text NOT NULL,
    description text NOT NULL,
    stars integer DEFAULT 0 NOT NULL,
    installs integer DEFAULT 0 NOT NULL,
    thumbnail text,
    "appState" jsonb NOT NULL,
    resources jsonb DEFAULT '[]'::jsonb NOT NULL,
    "dataSnapshot" jsonb,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    faqs jsonb DEFAULT '[]'::jsonb NOT NULL,
    "urlPath" character varying(255) DEFAULT ''::character varying NOT NULL
);


ALTER TABLE public.blueprints OWNER TO retool_internal_user;

--
-- Name: blueprints_appstore_tags; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.blueprints_appstore_tags (
    "blueprintId" uuid,
    "tagId" uuid,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.blueprints_appstore_tags OWNER TO retool_internal_user;

--
-- Name: branches; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.branches (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    "organizationId" integer NOT NULL,
    "pageId" integer,
    "pageSaveId" integer,
    "ownerId" integer,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone,
    "deletedAt" timestamp with time zone,
    "baseCommit" character varying(255),
    "lastSyncedCommit" character varying(255),
    shared boolean DEFAULT false NOT NULL
);


ALTER TABLE public.branches OWNER TO retool_internal_user;

--
-- Name: commits; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.commits (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    subject text NOT NULL,
    body text NOT NULL,
    "pageSaveId" integer,
    "branchId" uuid,
    "authorId" integer,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone,
    "gitSha" character varying(255)
);


ALTER TABLE public.commits OWNER TO retool_internal_user;

--
-- Name: component_metadata; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.component_metadata (
    id integer NOT NULL,
    "appMetadataId" integer,
    "componentId" text DEFAULT 'none'::text NOT NULL,
    "componentType" text DEFAULT 'none'::text NOT NULL,
    height integer NOT NULL,
    width integer NOT NULL,
    "containerId" text,
    "componentProperties" json NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


ALTER TABLE public.component_metadata OWNER TO retool_internal_user;

--
-- Name: component_metadata_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.component_metadata_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.component_metadata_id_seq OWNER TO retool_internal_user;

--
-- Name: component_metadata_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.component_metadata_id_seq OWNED BY public.component_metadata.id;


--
-- Name: config_var_values; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.config_var_values (
    uuid uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "configVarUuid" uuid NOT NULL,
    "environmentId" uuid NOT NULL,
    value text NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.config_var_values OWNER TO retool_internal_user;

--
-- Name: config_vars; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.config_vars (
    uuid uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "organizationId" integer NOT NULL,
    name text NOT NULL,
    description text,
    secret boolean DEFAULT false NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.config_vars OWNER TO retool_internal_user;

--
-- Name: custom_component_collection_revision_files; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.custom_component_collection_revision_files (
    id bigint NOT NULL,
    "customComponentCollectionRevisionId" bigint,
    filepath text NOT NULL,
    "fileValue" bytea NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.custom_component_collection_revision_files OWNER TO retool_internal_user;

--
-- Name: custom_component_collection_revision_files_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.custom_component_collection_revision_files_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.custom_component_collection_revision_files_id_seq OWNER TO retool_internal_user;

--
-- Name: custom_component_collection_revision_files_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.custom_component_collection_revision_files_id_seq OWNED BY public.custom_component_collection_revision_files.id;


--
-- Name: custom_component_collection_revisions; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.custom_component_collection_revisions (
    id bigint NOT NULL,
    uuid uuid NOT NULL,
    version integer,
    "customComponentCollectionId" bigint,
    "publishedAt" timestamp with time zone,
    "userId" bigint NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.custom_component_collection_revisions OWNER TO retool_internal_user;

--
-- Name: custom_component_collection_revisions_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.custom_component_collection_revisions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.custom_component_collection_revisions_id_seq OWNER TO retool_internal_user;

--
-- Name: custom_component_collection_revisions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.custom_component_collection_revisions_id_seq OWNED BY public.custom_component_collection_revisions.id;


--
-- Name: custom_component_collections; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.custom_component_collections (
    id bigint NOT NULL,
    name text NOT NULL,
    label text NOT NULL,
    description text,
    uuid uuid NOT NULL,
    "organizationId" integer NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.custom_component_collections OWNER TO retool_internal_user;

--
-- Name: custom_component_collections_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.custom_component_collections_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.custom_component_collections_id_seq OWNER TO retool_internal_user;

--
-- Name: custom_component_collections_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.custom_component_collections_id_seq OWNED BY public.custom_component_collections.id;


--
-- Name: custom_domains; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.custom_domains (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "organizationId" integer,
    domain character varying(255) NOT NULL,
    "isVerified" boolean DEFAULT false NOT NULL,
    "verificationError" text,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "pendingDeletion" boolean DEFAULT false NOT NULL
);


ALTER TABLE public.custom_domains OWNER TO retool_internal_user;

--
-- Name: dg_activity; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.dg_activity (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "gridId" text,
    "actorUserId" integer,
    "activityType" text NOT NULL,
    "bulkEditId" text,
    "singleEditId" uuid,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "table" text,
    "recordId" text,
    "onlyShowOnRecord" boolean NOT NULL
);


ALTER TABLE public.dg_activity OWNER TO retool_internal_user;

--
-- Name: dg_bulk_edit; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.dg_bulk_edit (
    id text NOT NULL,
    "gridId" text NOT NULL,
    "createdByUserId" integer NOT NULL,
    "executedAt" timestamp with time zone,
    "executedByUserId" integer,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.dg_bulk_edit OWNER TO retool_internal_user;

--
-- Name: dg_grid; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.dg_grid (
    id character varying(255) NOT NULL,
    "resourceId" integer NOT NULL,
    "organizationId" integer NOT NULL,
    name text NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "allowSchemaEdit" boolean DEFAULT false NOT NULL,
    namespace text,
    onboarded boolean DEFAULT false NOT NULL
);


ALTER TABLE public.dg_grid OWNER TO retool_internal_user;

--
-- Name: dg_single_edit; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.dg_single_edit (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "gridId" text NOT NULL,
    "table" text NOT NULL,
    "editType" text NOT NULL,
    "bulkEditId" text,
    "rowId" text,
    "addedRowFields" text[],
    "addedRowData" text[],
    field text,
    "oldValue" text,
    "newValue" text,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.dg_single_edit OWNER TO retool_internal_user;

--
-- Name: embeds; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.embeds (
    id integer NOT NULL,
    uuid character varying(255) NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "pageId" integer,
    password character varying(255)
);


ALTER TABLE public.embeds OWNER TO retool_internal_user;

--
-- Name: embeds_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.embeds_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.embeds_id_seq OWNER TO retool_internal_user;

--
-- Name: embeds_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.embeds_id_seq OWNED BY public.embeds.id;


--
-- Name: environment_config_vars; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.environment_config_vars (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "environmentId" uuid NOT NULL,
    key text NOT NULL,
    value text NOT NULL,
    description text,
    encrypted boolean NOT NULL,
    public boolean NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.environment_config_vars OWNER TO retool_internal_user;

--
-- Name: environments; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.environments (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "organizationId" integer NOT NULL,
    name text NOT NULL,
    description text,
    "displayColor" character varying(255) NOT NULL,
    "authorId" integer,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "isDefault" boolean DEFAULT false NOT NULL
);


ALTER TABLE public.environments OWNER TO retool_internal_user;

--
-- Name: event_workflows; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.event_workflows (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "organizationId" integer NOT NULL,
    "workflowId" uuid NOT NULL,
    "eventType" character varying(255) NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    enabled boolean DEFAULT true NOT NULL
);


ALTER TABLE public.event_workflows OWNER TO retool_internal_user;

--
-- Name: experiment_audiences; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.experiment_audiences (
    id integer NOT NULL,
    "organizationId" integer,
    "experimentId" integer NOT NULL,
    "userId" integer,
    value character varying(255) NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "deletedAt" timestamp with time zone,
    CONSTRAINT "experiment_audiences_organizationId_userId_ck" CHECK (((("userId" IS NOT NULL) OR ("organizationId" IS NOT NULL)) AND (NOT (("userId" IS NOT NULL) AND ("organizationId" IS NOT NULL)))))
);


ALTER TABLE public.experiment_audiences OWNER TO retool_internal_user;

--
-- Name: experiment_audiences_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.experiment_audiences_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.experiment_audiences_id_seq OWNER TO retool_internal_user;

--
-- Name: experiment_audiences_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.experiment_audiences_id_seq OWNED BY public.experiment_audiences.id;


--
-- Name: experiment_strategies; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.experiment_strategies (
    id integer NOT NULL,
    strategy character varying(255),
    "experimentId" integer NOT NULL,
    "enrollmentCriteria" jsonb,
    value jsonb NOT NULL,
    "targetId" integer,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone
);


ALTER TABLE public.experiment_strategies OWNER TO retool_internal_user;

--
-- Name: experiment_strategies_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.experiment_strategies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.experiment_strategies_id_seq OWNER TO retool_internal_user;

--
-- Name: experiment_strategies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.experiment_strategies_id_seq OWNED BY public.experiment_strategies.id;


--
-- Name: experiments; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.experiments (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "deletedAt" timestamp with time zone,
    "minVersion" character varying(255) DEFAULT NULL::character varying
);


ALTER TABLE public.experiments OWNER TO retool_internal_user;

--
-- Name: experiments_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.experiments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.experiments_id_seq OWNER TO retool_internal_user;

--
-- Name: experiments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.experiments_id_seq OWNED BY public.experiments.id;


--
-- Name: external_embed_sessions; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.external_embed_sessions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "personalAccessTokenId" uuid NOT NULL,
    "organizationId" integer NOT NULL,
    "externalUserId" uuid,
    "pageUuid" uuid NOT NULL,
    "groupIds" integer[] NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    nonce character varying(255) NOT NULL,
    token character varying(255) NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    status character varying(255) NOT NULL,
    "userId" integer
);


ALTER TABLE public.external_embed_sessions OWNER TO retool_internal_user;

--
-- Name: external_users; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.external_users (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "organizationId" integer NOT NULL,
    "externalIdentifier" character varying(255) NOT NULL,
    "firstName" character varying(255),
    "lastName" character varying(255),
    email character varying(255),
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


ALTER TABLE public.external_users OWNER TO retool_internal_user;

--
-- Name: features; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.features (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


ALTER TABLE public.features OWNER TO retool_internal_user;

--
-- Name: features_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.features_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.features_id_seq OWNER TO retool_internal_user;

--
-- Name: features_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.features_id_seq OWNED BY public.features.id;


--
-- Name: flow_input_schemas; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.flow_input_schemas (
    id integer NOT NULL,
    "flowId" integer NOT NULL,
    type character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    required boolean DEFAULT false NOT NULL,
    "uniqueForOpenTasks" boolean DEFAULT false NOT NULL
);


ALTER TABLE public.flow_input_schemas OWNER TO retool_internal_user;

--
-- Name: flow_input_schemas_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.flow_input_schemas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.flow_input_schemas_id_seq OWNER TO retool_internal_user;

--
-- Name: flow_input_schemas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.flow_input_schemas_id_seq OWNED BY public.flow_input_schemas.id;


--
-- Name: flow_queries; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.flow_queries (
    id integer NOT NULL,
    "playgroundQuerySaveId" integer NOT NULL,
    "flowStageId" integer NOT NULL,
    model jsonb NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


ALTER TABLE public.flow_queries OWNER TO retool_internal_user;

--
-- Name: flow_queries_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.flow_queries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.flow_queries_id_seq OWNER TO retool_internal_user;

--
-- Name: flow_queries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.flow_queries_id_seq OWNED BY public.flow_queries.id;


--
-- Name: flow_stages; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.flow_stages (
    id integer NOT NULL,
    "flowId" integer NOT NULL,
    name character varying(255) NOT NULL,
    "isFinalStage" boolean NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


ALTER TABLE public.flow_stages OWNER TO retool_internal_user;

--
-- Name: flow_stages_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.flow_stages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.flow_stages_id_seq OWNER TO retool_internal_user;

--
-- Name: flow_stages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.flow_stages_id_seq OWNED BY public.flow_stages.id;


--
-- Name: flow_task_histories; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.flow_task_histories (
    id integer NOT NULL,
    "flowId" integer NOT NULL,
    "flowStageId" integer,
    "taskId" integer,
    inputs jsonb NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


ALTER TABLE public.flow_task_histories OWNER TO retool_internal_user;

--
-- Name: flow_task_histories_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.flow_task_histories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.flow_task_histories_id_seq OWNER TO retool_internal_user;

--
-- Name: flow_task_histories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.flow_task_histories_id_seq OWNED BY public.flow_task_histories.id;


--
-- Name: flow_task_inputs; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.flow_task_inputs (
    id integer NOT NULL,
    "taskId" integer NOT NULL,
    "flowInputSchemaId" integer NOT NULL,
    value text NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


ALTER TABLE public.flow_task_inputs OWNER TO retool_internal_user;

--
-- Name: flow_task_inputs_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.flow_task_inputs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.flow_task_inputs_id_seq OWNER TO retool_internal_user;

--
-- Name: flow_task_inputs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.flow_task_inputs_id_seq OWNED BY public.flow_task_inputs.id;


--
-- Name: flow_tasks; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.flow_tasks (
    id integer NOT NULL,
    "flowStageId" integer NOT NULL,
    "flowId" integer NOT NULL,
    "ownerId" integer,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "deletedAt" timestamp with time zone
);


ALTER TABLE public.flow_tasks OWNER TO retool_internal_user;

--
-- Name: flow_tasks_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.flow_tasks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.flow_tasks_id_seq OWNER TO retool_internal_user;

--
-- Name: flow_tasks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.flow_tasks_id_seq OWNED BY public.flow_tasks.id;


--
-- Name: flows; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.flows (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    "organizationId" integer NOT NULL,
    "ownerId" integer,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


ALTER TABLE public.flows OWNER TO retool_internal_user;

--
-- Name: flows_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.flows_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.flows_id_seq OWNER TO retool_internal_user;

--
-- Name: flows_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.flows_id_seq OWNED BY public.flows.id;


--
-- Name: folder_favorites; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.folder_favorites (
    id integer NOT NULL,
    "folderId" integer,
    "userId" integer,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


ALTER TABLE public.folder_favorites OWNER TO retool_internal_user;

--
-- Name: folder_favorites_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.folder_favorites_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.folder_favorites_id_seq OWNER TO retool_internal_user;

--
-- Name: folder_favorites_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.folder_favorites_id_seq OWNED BY public.folder_favorites.id;


--
-- Name: folders; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.folders (
    id integer NOT NULL,
    name character varying(255),
    "organizationId" integer,
    "systemFolder" boolean DEFAULT false NOT NULL,
    "parentFolderId" integer,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "folderType" character varying(255) NOT NULL,
    CONSTRAINT root_folder_is_root CHECK ((((name)::text <> 'root'::text) OR ("systemFolder" IS FALSE) OR ("parentFolderId" IS NULL)))
);


ALTER TABLE public.folders OWNER TO retool_internal_user;

--
-- Name: folders_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.folders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.folders_id_seq OWNER TO retool_internal_user;

--
-- Name: folders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.folders_id_seq OWNED BY public.folders.id;


--
-- Name: form_fields; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.form_fields (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "formId" uuid NOT NULL,
    name character varying(255) NOT NULL,
    type character varying(255) NOT NULL,
    active boolean DEFAULT false NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    uuid uuid
);


ALTER TABLE public.form_fields OWNER TO retool_internal_user;

--
-- Name: forms; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.forms (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "organizationId" integer NOT NULL,
    "pageId" integer NOT NULL,
    "resourceName" character varying(255),
    "tableName" character varying(255) NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    type character varying(255)
);


ALTER TABLE public.forms OWNER TO retool_internal_user;

--
-- Name: grid_field; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.grid_field (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "fieldName" text NOT NULL,
    "enumOptions" jsonb,
    "gridId" text NOT NULL,
    "table" text NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "displayTimezone" text
);


ALTER TABLE public.grid_field OWNER TO retool_internal_user;

--
-- Name: grid_group_access; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.grid_group_access (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "gridId" text NOT NULL,
    "groupId" integer NOT NULL,
    "accessLevel" text NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.grid_group_access OWNER TO retool_internal_user;

--
-- Name: grid_managed_cluster_resources; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.grid_managed_cluster_resources (
    id character varying(255) NOT NULL,
    "resourceId" integer NOT NULL,
    "gridManagedClusterId" character varying(255) NOT NULL,
    "userId" integer NOT NULL,
    "databaseName" character varying(255) NOT NULL,
    "databaseUsername" character varying(255) NOT NULL
);


ALTER TABLE public.grid_managed_cluster_resources OWNER TO retool_internal_user;

--
-- Name: grid_managed_clusters; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.grid_managed_clusters (
    id character varying(255) NOT NULL,
    type character varying(255) NOT NULL,
    host character varying(255) NOT NULL,
    port integer NOT NULL,
    "databaseName" character varying(255) NOT NULL,
    "databaseUsername" character varying(255) NOT NULL,
    "databasePassword" character varying(255) NOT NULL,
    "createdBy" character varying(255) NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    ssl boolean DEFAULT true NOT NULL
);


ALTER TABLE public.grid_managed_clusters OWNER TO retool_internal_user;

--
-- Name: grid_table_group_access; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.grid_table_group_access (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "gridId" text NOT NULL,
    "table" text NOT NULL,
    "groupId" integer NOT NULL,
    "accessLevel" text NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.grid_table_group_access OWNER TO retool_internal_user;

--
-- Name: grid_table_user_access; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.grid_table_user_access (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "gridId" text NOT NULL,
    "userId" integer NOT NULL,
    "table" text NOT NULL,
    "accessLevel" text NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.grid_table_user_access OWNER TO retool_internal_user;

--
-- Name: grid_user_access; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.grid_user_access (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "gridId" text NOT NULL,
    "userId" integer NOT NULL,
    "accessLevel" text NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.grid_user_access OWNER TO retool_internal_user;

--
-- Name: grid_view; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.grid_view (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    "table" text NOT NULL,
    filter jsonb NOT NULL,
    sort jsonb NOT NULL,
    fields jsonb NOT NULL,
    "pinnedFields" jsonb NOT NULL,
    "gridId" text NOT NULL,
    "createdByUserId" integer,
    shared boolean NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.grid_view OWNER TO retool_internal_user;

--
-- Name: group_folder_defaults; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.group_folder_defaults (
    id integer NOT NULL,
    "accessLevel" character varying(255) NOT NULL,
    "groupId" integer NOT NULL,
    "folderId" integer NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone
);


ALTER TABLE public.group_folder_defaults OWNER TO retool_internal_user;

--
-- Name: group_folder_defaults_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.group_folder_defaults_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.group_folder_defaults_id_seq OWNER TO retool_internal_user;

--
-- Name: group_folder_defaults_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.group_folder_defaults_id_seq OWNED BY public.group_folder_defaults.id;


--
-- Name: group_pages; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.group_pages (
    id integer NOT NULL,
    "groupId" integer,
    "pageId" integer,
    "accessLevel" character varying(255) NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


ALTER TABLE public.group_pages OWNER TO retool_internal_user;

--
-- Name: group_pages_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.group_pages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.group_pages_id_seq OWNER TO retool_internal_user;

--
-- Name: group_pages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.group_pages_id_seq OWNED BY public.group_pages.id;


--
-- Name: group_resource_folder_defaults; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.group_resource_folder_defaults (
    "accessLevel" character varying(255) NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    id integer NOT NULL,
    "groupId" integer NOT NULL,
    "resourceFolderId" integer NOT NULL
);


ALTER TABLE public.group_resource_folder_defaults OWNER TO retool_internal_user;

--
-- Name: group_resource_folder_defaults_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.group_resource_folder_defaults_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.group_resource_folder_defaults_id_seq OWNER TO retool_internal_user;

--
-- Name: group_resource_folder_defaults_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.group_resource_folder_defaults_id_seq OWNED BY public.group_resource_folder_defaults.id;


--
-- Name: group_resources; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.group_resources (
    id integer NOT NULL,
    "groupId" integer,
    "resourceId" integer,
    "accessLevel" character varying(255) NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "resourceName" character varying(255),
    "resourceIdForEnv" integer
);


ALTER TABLE public.group_resources OWNER TO retool_internal_user;

--
-- Name: group_resources_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.group_resources_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.group_resources_id_seq OWNER TO retool_internal_user;

--
-- Name: group_resources_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.group_resources_id_seq OWNED BY public.group_resources.id;


--
-- Name: group_workflows; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.group_workflows (
    id integer NOT NULL,
    "groupId" integer,
    "workflowId" uuid,
    "accessLevel" character varying(255) NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


ALTER TABLE public.group_workflows OWNER TO retool_internal_user;

--
-- Name: group_workflows_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.group_workflows_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.group_workflows_id_seq OWNER TO retool_internal_user;

--
-- Name: group_workflows_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.group_workflows_id_seq OWNED BY public.group_workflows.id;


--
-- Name: groups; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.groups (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    "organizationId" integer,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "universalAccess" character varying(255) DEFAULT 'none'::character varying NOT NULL,
    "universalResourceAccess" character varying(255) DEFAULT 'none'::character varying NOT NULL,
    "universalQueryLibraryAccess" character varying(255) DEFAULT 'none'::character varying NOT NULL,
    "userListAccess" boolean DEFAULT false NOT NULL,
    "archivedAt" timestamp with time zone,
    "auditLogAccess" boolean DEFAULT false NOT NULL,
    "unpublishedReleaseAccess" boolean DEFAULT true NOT NULL,
    "universalWorkflowAccess" character varying(255) DEFAULT 'none'::character varying NOT NULL,
    "usageAnalyticsAccess" boolean,
    "accountDetailsAccess" boolean DEFAULT true NOT NULL,
    CONSTRAINT "check_universalAccess" CHECK ((("universalAccess")::text = ANY ((ARRAY['own'::character varying, 'write'::character varying, 'read'::character varying, 'none'::character varying])::text[]))),
    CONSTRAINT "check_universalQueryLibraryAccess" CHECK ((("universalQueryLibraryAccess")::text = ANY ((ARRAY['write'::character varying, 'read'::character varying, 'none'::character varying])::text[]))),
    CONSTRAINT "check_universalResourceAccess" CHECK ((("universalResourceAccess")::text = ANY ((ARRAY['own'::character varying, 'read'::character varying, 'write'::character varying, 'none'::character varying])::text[]))),
    CONSTRAINT "check_universalWorkflowAccess" CHECK ((("universalWorkflowAccess")::text = ANY (ARRAY[('own'::character varying)::text, ('write'::character varying)::text, ('read'::character varying)::text, ('none'::character varying)::text])))
);


ALTER TABLE public.groups OWNER TO retool_internal_user;

--
-- Name: groups_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.groups_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.groups_id_seq OWNER TO retool_internal_user;

--
-- Name: groups_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.groups_id_seq OWNED BY public.groups.id;


--
-- Name: iam_credentials; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.iam_credentials (
    uuid uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "organizationId" integer NOT NULL,
    "awsAccessKeyId" text NOT NULL,
    "awsSecretAccessKey" text NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.iam_credentials OWNER TO retool_internal_user;

--
-- Name: instrumentation_integrations; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.instrumentation_integrations (
    id integer NOT NULL,
    integration character varying(255) NOT NULL,
    key character varying(255),
    enabled boolean,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    organization_id integer,
    config jsonb
);


ALTER TABLE public.instrumentation_integrations OWNER TO retool_internal_user;

--
-- Name: instrumentation_integrations_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.instrumentation_integrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.instrumentation_integrations_id_seq OWNER TO retool_internal_user;

--
-- Name: instrumentation_integrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.instrumentation_integrations_id_seq OWNED BY public.instrumentation_integrations.id;


--
-- Name: language_configuration; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.language_configuration (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "organizationId" integer NOT NULL,
    name character varying(255) NOT NULL,
    language character varying(255) NOT NULL,
    libraries jsonb NOT NULL,
    "librariesFormat" character varying(255) NOT NULL,
    "aliasFor" uuid,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.language_configuration OWNER TO retool_internal_user;

--
-- Name: language_configuration_save; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.language_configuration_save (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "languageConfigurationId" uuid NOT NULL,
    name character varying(255) NOT NULL,
    description character varying(255),
    libraries jsonb NOT NULL,
    "librariesFormat" character varying(255) NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.language_configuration_save OWNER TO retool_internal_user;

--
-- Name: notification_applications; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.notification_applications (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "organizationId" integer NOT NULL,
    "bundleId" character varying(255) NOT NULL,
    platform public.enum_notification_applications_platform NOT NULL,
    "notifierApplicationId" character varying(255) NOT NULL,
    "createdBy" integer NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.notification_applications OWNER TO retool_internal_user;

--
-- Name: notification_subscribed_devices; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.notification_subscribed_devices (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "userId" integer NOT NULL,
    "deviceId" character varying(255) NOT NULL,
    "transportType" public."enum_notification_subscribed_devices_transportType" NOT NULL,
    "transportData" json NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


ALTER TABLE public.notification_subscribed_devices OWNER TO retool_internal_user;

--
-- Name: notification_topic_subscriptions; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.notification_topic_subscriptions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "organizationId" integer NOT NULL,
    "pageId" uuid NOT NULL,
    "userId" integer NOT NULL,
    "topicName" character varying(255) NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


ALTER TABLE public.notification_topic_subscriptions OWNER TO retool_internal_user;

--
-- Name: org_image_blobs; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.org_image_blobs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "deletedAt" timestamp with time zone,
    type character varying(255) NOT NULL,
    blob bytea NOT NULL,
    "organizationId" integer
);


ALTER TABLE public.org_image_blobs OWNER TO retool_internal_user;

--
-- Name: organization_email_domains; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.organization_email_domains (
    "organizationId" integer NOT NULL,
    "emailDomain" text NOT NULL,
    "allowAutoJoin" boolean DEFAULT true NOT NULL,
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL
);


ALTER TABLE public.organization_email_domains OWNER TO retool_internal_user;

--
-- Name: organization_user_attributes; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.organization_user_attributes (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "organizationId" integer NOT NULL,
    name character varying(255) NOT NULL,
    label character varying(255) NOT NULL,
    "dataType" character varying(255) NOT NULL,
    "defaultValue" character varying(255),
    "intercomAttributeName" character varying(255)
);


ALTER TABLE public.organization_user_attributes OWNER TO retool_internal_user;

--
-- Name: organizations; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.organizations (
    id integer NOT NULL,
    domain character varying(255),
    name character varying(255) NOT NULL,
    hostname character varying(255),
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    subdomain character varying(255),
    "trialExpiryDate" timestamp with time zone,
    "preloadedJavaScript" text,
    "javaScriptLinks" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "gitUrl" character varying(255),
    "planId" integer,
    "stripeCustomerId" character varying(255),
    "billingCardholderName" character varying(255) DEFAULT NULL::character varying,
    "billingCardLastFour" character varying(255) DEFAULT NULL::character varying,
    "billingCardExpirationDate" timestamp with time zone,
    "stripeSubscriptionId" character varying(255) DEFAULT NULL::character varying,
    "billingCardBrand" character varying(255) DEFAULT NULL::character varying,
    "billingCardholderEmail" character varying(255) DEFAULT NULL::character varying,
    "preloadedCSS" text,
    sid character varying(255) DEFAULT ('org_'::text || replace((public.uuid_generate_v4())::text, '-'::text, ''::text)) NOT NULL,
    "isCompanyAccount" boolean,
    "companyName" character varying(255) DEFAULT NULL::character varying,
    "contactNumber" character varying(255) DEFAULT NULL::character varying,
    "gitBranch" character varying(255),
    "twoFactorAuthRequired" boolean,
    "applyPreloadedCSSToHomepage" boolean DEFAULT false NOT NULL,
    "onboardingChecklist" jsonb,
    "idpMetadataXML" text,
    "jitEnabled" boolean,
    "onboardingStagesCompleted" jsonb DEFAULT '[]'::jsonb,
    "themeId" integer,
    "licenseVerification" jsonb,
    "platformLevelAuthSteps" json,
    "defaultAppThemeId" integer,
    "protectedGitHubOrg" text,
    "protectedGitHubRepo" text,
    "protectedGitBranch" text,
    "protectedGitCommit" text,
    "cacheQueriesPerUser" boolean,
    "protectedGitHubBaseUrl" text,
    "protectedGitHubEnterpriseUrl" text,
    "onpremStripeSubscriptionId" character varying(255),
    "onpremStripePlanId" character varying(255),
    "inCanaryGroup" boolean,
    "protectedAppsSyncEnabled" boolean DEFAULT false NOT NULL,
    "releaseManagementEnabled" boolean DEFAULT true NOT NULL,
    "stripeCurrentPeriodStart" timestamp with time zone,
    "stripeCurrentPeriodEnd" timestamp with time zone,
    "retoolDBStorageLimitBytes" bigint,
    "retoolDBRowLimit" bigint,
    "retoolDBQueryRateLimitRequestsPerMinute" bigint,
    "sourceControlEmailAlertingEnabled" boolean DEFAULT true,
    "billingType" text,
    "annualSubscriptionDetails" jsonb,
    "workflowRunRetentionPeriodMins" integer,
    "customSSOType" character varying(255),
    "customSSOSettings" jsonb,
    "localPermissionsManagementEnabled" boolean DEFAULT false,
    "aiSupportBotDisabled" boolean DEFAULT false,
    "defaultOutboundRegion" character varying(255) DEFAULT NULL::character varying,
    "trialPlanId" integer,
    "trialAdditionalFeatures" integer[],
    "requestAccessEnabled" boolean,
    "parentOrgId" integer,
    "isReferral" boolean DEFAULT false,
    enabled boolean DEFAULT true,
    "securityContact" character varying(255)
);


ALTER TABLE public.organizations OWNER TO retool_internal_user;

--
-- Name: organizations_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.organizations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.organizations_id_seq OWNER TO retool_internal_user;

--
-- Name: organizations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.organizations_id_seq OWNED BY public.organizations.id;


--
-- Name: page_docs; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.page_docs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "pageId" integer NOT NULL,
    "editorDocumentation" text,
    "userDocumentation" text,
    "openIfNotYetSeen" boolean NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "lastEditedBy" integer
);


ALTER TABLE public.page_docs OWNER TO retool_internal_user;

--
-- Name: page_favorites; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.page_favorites (
    id integer NOT NULL,
    "pageId" integer,
    "userId" integer,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


ALTER TABLE public.page_favorites OWNER TO retool_internal_user;

--
-- Name: page_favorites_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.page_favorites_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.page_favorites_id_seq OWNER TO retool_internal_user;

--
-- Name: page_favorites_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.page_favorites_id_seq OWNED BY public.page_favorites.id;


--
-- Name: page_onboarding_state; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.page_onboarding_state (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "pageId" integer NOT NULL,
    data json,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


ALTER TABLE public.page_onboarding_state OWNER TO retool_internal_user;

--
-- Name: page_save_playground_query_saves; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.page_save_playground_query_saves (
    id integer NOT NULL,
    "pageSaveId" integer,
    "playgroundQuerySaveId" integer,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "pageId" integer,
    "playgroundQueryId" integer,
    "pinnedToLatestVersion" boolean DEFAULT false NOT NULL
);


ALTER TABLE public.page_save_playground_query_saves OWNER TO retool_internal_user;

--
-- Name: page_save_playground_query_saves_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.page_save_playground_query_saves_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.page_save_playground_query_saves_id_seq OWNER TO retool_internal_user;

--
-- Name: page_save_playground_query_saves_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.page_save_playground_query_saves_id_seq OWNED BY public.page_save_playground_query_saves.id;


--
-- Name: page_saves; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.page_saves (
    id integer NOT NULL,
    data jsonb,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "pageId" integer,
    "changesRecord" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "userId" integer,
    "gitSha" character varying(255),
    "branchId" uuid,
    checksum text
);


ALTER TABLE public.page_saves OWNER TO retool_internal_user;

--
-- Name: page_saves_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.page_saves_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.page_saves_id_seq OWNER TO retool_internal_user;

--
-- Name: page_saves_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.page_saves_id_seq OWNED BY public.page_saves.id;


--
-- Name: page_user_heartbeats; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.page_user_heartbeats (
    "userId" integer NOT NULL,
    "pageId" integer NOT NULL,
    mode text NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    CONSTRAINT page_user_heartbeats_mode_ck CHECK ((mode = ANY (ARRAY['editing'::text, 'viewing'::text])))
);


ALTER TABLE public.page_user_heartbeats OWNER TO retool_internal_user;

--
-- Name: pages; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.pages (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "organizationId" integer,
    "folderId" integer NOT NULL,
    uuid uuid DEFAULT public.uuid_generate_v1mc() NOT NULL,
    "releasedTagId" uuid,
    "photoUrl" character varying(255),
    "deletedAt" timestamp with time zone,
    "lastEditedBy" integer,
    "isGlobalWidget" boolean,
    protected boolean DEFAULT false NOT NULL,
    synced boolean DEFAULT false NOT NULL,
    description character varying(255),
    "clonedFromTemplateName" character varying(255),
    "isMobileApp" boolean,
    "tempReleasedTagId" uuid,
    "blueprintMetadata" jsonb,
    "isFormApp" boolean DEFAULT false,
    shortlink character varying(255)
);


ALTER TABLE public.pages OWNER TO retool_internal_user;

--
-- Name: pages_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.pages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.pages_id_seq OWNER TO retool_internal_user;

--
-- Name: pages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.pages_id_seq OWNED BY public.pages.id;


--
-- Name: partially_registered_users; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.partially_registered_users (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    email text NOT NULL,
    "firstName" text NOT NULL,
    "lastName" text NOT NULL,
    "hashedPassword" text,
    "registrationToken" text NOT NULL,
    "usedSso" boolean NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "verifiedAt" timestamp with time zone,
    CONSTRAINT partially_registered_users_check CHECK (((("usedSso" = true) AND ("verifiedAt" IS NOT NULL)) OR ("usedSso" = false))),
    CONSTRAINT password_set_for_non_sso CHECK ((("usedSso" = true) OR ("hashedPassword" IS NOT NULL)))
);


ALTER TABLE public.partially_registered_users OWNER TO retool_internal_user;

--
-- Name: personal_access_tokens; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.personal_access_tokens (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    label text NOT NULL,
    description text,
    "hashedKey" text NOT NULL,
    "organizationId" integer NOT NULL,
    "userId" integer NOT NULL,
    revoked boolean DEFAULT false NOT NULL,
    scope jsonb DEFAULT '[]'::jsonb,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    last4 text DEFAULT ''::text NOT NULL
);


ALTER TABLE public.personal_access_tokens OWNER TO retool_internal_user;

--
-- Name: plan_features; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.plan_features (
    id integer NOT NULL,
    "planId" integer,
    "featureId" integer,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


ALTER TABLE public.plan_features OWNER TO retool_internal_user;

--
-- Name: plan_features_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.plan_features_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.plan_features_id_seq OWNER TO retool_internal_user;

--
-- Name: plan_features_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.plan_features_id_seq OWNED BY public.plan_features.id;


--
-- Name: plans; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.plans (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "stripePlanId" character varying(255),
    "minSeats" integer DEFAULT 0 NOT NULL,
    grandfathered boolean DEFAULT false NOT NULL
);


ALTER TABLE public.plans OWNER TO retool_internal_user;

--
-- Name: plans_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.plans_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.plans_id_seq OWNER TO retool_internal_user;

--
-- Name: plans_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.plans_id_seq OWNED BY public.plans.id;


--
-- Name: playground_queries; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.playground_queries (
    id integer NOT NULL,
    name text,
    description text,
    shared boolean,
    "ownerId" integer,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "organizationId" integer,
    uuid uuid DEFAULT public.uuid_generate_v4() NOT NULL
);


ALTER TABLE public.playground_queries OWNER TO retool_internal_user;

--
-- Name: playground_queries_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.playground_queries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.playground_queries_id_seq OWNER TO retool_internal_user;

--
-- Name: playground_queries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.playground_queries_id_seq OWNED BY public.playground_queries.id;


--
-- Name: playground_query_saves; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.playground_query_saves (
    id integer NOT NULL,
    data jsonb NOT NULL,
    "resourceId" integer,
    "adhocResourceType" text,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "editorId" integer,
    "playgroundQueryId" integer NOT NULL,
    uuid uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "playgroundQueryUuid" uuid NOT NULL,
    "resourceUuid" uuid,
    CONSTRAINT "resourceUuid_or_adhocResourceType" CHECK (((("resourceUuid" IS NULL) AND ("adhocResourceType" IS NOT NULL)) OR (("adhocResourceType" IS NULL) AND ("resourceUuid" IS NOT NULL))))
);


ALTER TABLE public.playground_query_saves OWNER TO retool_internal_user;

--
-- Name: playground_query_saves_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.playground_query_saves_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.playground_query_saves_id_seq OWNER TO retool_internal_user;

--
-- Name: playground_query_saves_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.playground_query_saves_id_seq OWNED BY public.playground_query_saves.id;


--
-- Name: query_metadata; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.query_metadata (
    id integer NOT NULL,
    "appMetadataId" integer,
    "queryId" text DEFAULT 'none'::text NOT NULL,
    "queryType" text DEFAULT 'none'::text NOT NULL,
    "queryProperties" json NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


ALTER TABLE public.query_metadata OWNER TO retool_internal_user;

--
-- Name: query_metadata_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.query_metadata_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.query_metadata_id_seq OWNER TO retool_internal_user;

--
-- Name: query_metadata_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.query_metadata_id_seq OWNED BY public.query_metadata.id;


--
-- Name: recently_visited_apps; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.recently_visited_apps (
    "userId" integer NOT NULL,
    "pageId" integer NOT NULL,
    "visitType" character varying(255) NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


ALTER TABLE public.recently_visited_apps OWNER TO retool_internal_user;

--
-- Name: resource_folders; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.resource_folders (
    name character varying(255) NOT NULL,
    "systemFolder" boolean NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    id integer NOT NULL,
    "organizationId" integer NOT NULL,
    "parentFolderId" integer
);


ALTER TABLE public.resource_folders OWNER TO retool_internal_user;

--
-- Name: resource_folders_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.resource_folders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.resource_folders_id_seq OWNER TO retool_internal_user;

--
-- Name: resource_folders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.resource_folders_id_seq OWNED BY public.resource_folders.id;


--
-- Name: resource_preview_hints; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.resource_preview_hints (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "resourceType" character varying(255) NOT NULL,
    "errorMessageMatcher" character varying(255) NOT NULL,
    hint character varying(255) NOT NULL,
    active boolean NOT NULL,
    "requestType" character varying(255) NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone
);


ALTER TABLE public.resource_preview_hints OWNER TO retool_internal_user;

--
-- Name: COLUMN resource_preview_hints."resourceType"; Type: COMMENT; Schema: public; Owner: retool_internal_user
--

COMMENT ON COLUMN public.resource_preview_hints."resourceType" IS 'Expects a resourceType as defined by the enum stored in our client';


--
-- Name: COLUMN resource_preview_hints."errorMessageMatcher"; Type: COMMENT; Schema: public; Owner: retool_internal_user
--

COMMENT ON COLUMN public.resource_preview_hints."errorMessageMatcher" IS 'a regular expression to match the error message. For instance: .*error.*';


--
-- Name: COLUMN resource_preview_hints.hint; Type: COMMENT; Schema: public; Owner: retool_internal_user
--

COMMENT ON COLUMN public.resource_preview_hints.hint IS 'The hint to help the user debug the error';


--
-- Name: COLUMN resource_preview_hints.active; Type: COMMENT; Schema: public; Owner: retool_internal_user
--

COMMENT ON COLUMN public.resource_preview_hints.active IS 'If the hint should be displayed for the error or not';


--
-- Name: COLUMN resource_preview_hints."requestType"; Type: COMMENT; Schema: public; Owner: retool_internal_user
--

COMMENT ON COLUMN public.resource_preview_hints."requestType" IS 'The client request type that the hint corresponds to: run, connect, etc.
 This is a string to be extendable to other requests in the future.';


--
-- Name: resources; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.resources (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    type character varying(255) NOT NULL,
    host character varying(255),
    port character varying(255),
    "databaseName" character varying(255),
    "databaseUsername" character varying(255),
    "databasePassword" text,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "organizationId" integer NOT NULL,
    ssl boolean,
    "editPrivilege" boolean,
    options jsonb,
    environment character varying(255) DEFAULT 'production'::character varying NOT NULL,
    "dynamicallyQueryable" boolean DEFAULT false NOT NULL,
    "displayName" character varying(255),
    "environmentId" uuid,
    "resourceFolderId" integer,
    protected boolean DEFAULT false NOT NULL,
    "authorId" integer,
    "lastSyncedChecksum" character varying(255) DEFAULT NULL::character varying,
    uuid uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    description text,
    "outboundRegion" text,
    whitelabeled boolean
);


ALTER TABLE public.resources OWNER TO retool_internal_user;

--
-- Name: COLUMN resources."displayName"; Type: COMMENT; Schema: public; Owner: retool_internal_user
--

COMMENT ON COLUMN public.resources."displayName" IS 'This column is the name of the resource we will show to the user. We are adding this because the other `name` column is not changeable without breaking applications.';


--
-- Name: resources_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.resources_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.resources_id_seq OWNER TO retool_internal_user;

--
-- Name: resources_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.resources_id_seq OWNED BY public.resources.id;


--
-- Name: retool_databases; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.retool_databases (
    id integer NOT NULL,
    "databaseName" character varying(255) NOT NULL,
    "ownerUsername" character varying(255) NOT NULL,
    "ownerPassword" character varying(255) NOT NULL,
    "readonlyUsername" character varying(255) NOT NULL,
    "readonlyPassword" character varying(255) NOT NULL,
    "organizationId" integer,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


ALTER TABLE public.retool_databases OWNER TO retool_internal_user;

--
-- Name: retool_databases_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.retool_databases_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.retool_databases_id_seq OWNER TO retool_internal_user;

--
-- Name: retool_databases_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.retool_databases_id_seq OWNED BY public.retool_databases.id;


--
-- Name: retool_db_migrations; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.retool_db_migrations (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "pgPid" integer NOT NULL,
    "suggestedSqlScript" text NOT NULL,
    "sqlScript" text NOT NULL,
    "resourceName" text NOT NULL,
    "organizationId" integer NOT NULL,
    "originEnvironmentId" uuid,
    "targetEnvironmentId" uuid,
    status text NOT NULL,
    error text,
    "createdById" integer,
    "cancelledById" integer,
    "finishedAt" timestamp with time zone,
    "updatedAt" timestamp with time zone NOT NULL,
    "createdAt" timestamp with time zone NOT NULL
);


ALTER TABLE public.retool_db_migrations OWNER TO retool_internal_user;

--
-- Name: retool_db_provision; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.retool_db_provision (
    id integer NOT NULL,
    status text NOT NULL,
    "connectionString" text,
    "externalId" text,
    "resourceId" integer,
    "organizationId" integer,
    "updatedAt" timestamp with time zone NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "retoolUserConnectionString" text,
    "externalUserConnectionString" text,
    provider text DEFAULT 'supabase'::text
);


ALTER TABLE public.retool_db_provision OWNER TO retool_internal_user;

--
-- Name: retool_db_provision_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.retool_db_provision_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.retool_db_provision_id_seq OWNER TO retool_internal_user;

--
-- Name: retool_db_provision_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.retool_db_provision_id_seq OWNED BY public.retool_db_provision.id;


--
-- Name: retool_files; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.retool_files (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "organizationId" integer NOT NULL,
    "fileId" uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    "sizeBytes" bigint NOT NULL,
    "s3Key" text NOT NULL,
    "createdBy" integer,
    "updatedBy" integer,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "resourceId" integer NOT NULL,
    "mimeType" character varying(255),
    "folderId" integer
);


ALTER TABLE public.retool_files OWNER TO retool_internal_user;

--
-- Name: retool_managed_note; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.retool_managed_note (
    id integer NOT NULL,
    "evaluatedKey" character varying(255) NOT NULL,
    value text DEFAULT 'none'::text NOT NULL,
    "organizationId" integer,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


ALTER TABLE public.retool_managed_note OWNER TO retool_internal_user;

--
-- Name: retool_managed_note_comment; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.retool_managed_note_comment (
    id integer NOT NULL,
    "retoolManagedNoteId" integer,
    "userId" integer,
    value text DEFAULT 'none'::text NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


ALTER TABLE public.retool_managed_note_comment OWNER TO retool_internal_user;

--
-- Name: retool_managed_note_comment_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.retool_managed_note_comment_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.retool_managed_note_comment_id_seq OWNER TO retool_internal_user;

--
-- Name: retool_managed_note_comment_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.retool_managed_note_comment_id_seq OWNED BY public.retool_managed_note_comment.id;


--
-- Name: retool_managed_note_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.retool_managed_note_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.retool_managed_note_id_seq OWNER TO retool_internal_user;

--
-- Name: retool_managed_note_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.retool_managed_note_id_seq OWNED BY public.retool_managed_note.id;


--
-- Name: retool_rules; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.retool_rules (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "organizationId" integer NOT NULL,
    description text NOT NULL,
    name text NOT NULL,
    target text NOT NULL,
    actions jsonb NOT NULL,
    rules jsonb NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.retool_rules OWNER TO retool_internal_user;

--
-- Name: retool_table_events; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.retool_table_events (
    id integer NOT NULL,
    "retoolTableId" integer,
    "eventType" character varying(255),
    "sqlCommand" character varying(255),
    "sqlParameters" jsonb,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


ALTER TABLE public.retool_table_events OWNER TO retool_internal_user;

--
-- Name: retool_table_events_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.retool_table_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.retool_table_events_id_seq OWNER TO retool_internal_user;

--
-- Name: retool_table_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.retool_table_events_id_seq OWNED BY public.retool_table_events.id;


--
-- Name: retool_tables; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.retool_tables (
    id integer NOT NULL,
    "tableName" character varying(255),
    "retoolDatabaseId" integer,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


ALTER TABLE public.retool_tables OWNER TO retool_internal_user;

--
-- Name: retool_tables_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.retool_tables_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.retool_tables_id_seq OWNER TO retool_internal_user;

--
-- Name: retool_tables_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.retool_tables_id_seq OWNED BY public.retool_tables.id;


--
-- Name: role_pages; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.role_pages (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "pageId" integer NOT NULL,
    "organizationId" integer,
    "accessType" character varying(255) NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


ALTER TABLE public.role_pages OWNER TO retool_internal_user;

--
-- Name: role_pages_members; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.role_pages_members (
    id integer NOT NULL,
    "roleId" uuid NOT NULL,
    "organizationId" integer,
    "userId" integer,
    "userInviteId" integer,
    "isAdmin" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    CONSTRAINT chk_only_one_is_not_null CHECK ((num_nonnulls("userId", "userInviteId") = 1))
);


ALTER TABLE public.role_pages_members OWNER TO retool_internal_user;

--
-- Name: role_pages_members_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.role_pages_members_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.role_pages_members_id_seq OWNER TO retool_internal_user;

--
-- Name: role_pages_members_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.role_pages_members_id_seq OWNED BY public.role_pages_members.id;


--
-- Name: secrets_manager_configs; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.secrets_manager_configs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    provider character varying(255) NOT NULL,
    "organizationId" integer NOT NULL,
    config jsonb NOT NULL
);


ALTER TABLE public.secrets_manager_configs OWNER TO retool_internal_user;

--
-- Name: sessions; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.sessions (
    id integer NOT NULL,
    "userId" integer NOT NULL,
    "accessToken" text,
    "expirationDate" timestamp with time zone NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    status character varying(255),
    state jsonb
);


ALTER TABLE public.sessions OWNER TO retool_internal_user;

--
-- Name: sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.sessions_id_seq OWNER TO retool_internal_user;

--
-- Name: sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.sessions_id_seq OWNED BY public.sessions.id;


--
-- Name: source_control_deployment_settings; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.source_control_deployment_settings (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "nextDeployAt" timestamp with time zone,
    "organizationId" integer NOT NULL,
    "lastJobsRunnerHeartbeat" timestamp with time zone,
    "isExponentiallyBackedOff" boolean DEFAULT false NOT NULL
);


ALTER TABLE public.source_control_deployment_settings OWNER TO retool_internal_user;

--
-- Name: source_control_deployments; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.source_control_deployments (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    type character varying(255) NOT NULL,
    "commitSha" character varying(255) NOT NULL,
    status character varying(255) NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "completedAt" timestamp with time zone,
    logs jsonb[],
    "updatedAt" timestamp with time zone,
    "triggeredBy" integer,
    "organizationId" integer
);


ALTER TABLE public.source_control_deployments OWNER TO retool_internal_user;

--
-- Name: source_control_protection_status; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.source_control_protection_status (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "protectionBranchName" character varying(255),
    status character varying(255) NOT NULL,
    "protectionSha" character varying(255),
    "entityType" character varying(255),
    "entityUuid" uuid,
    "elementType" character varying(255) NOT NULL,
    "elementUuid" uuid NOT NULL,
    "organizationId" integer
);


ALTER TABLE public.source_control_protection_status OWNER TO retool_internal_user;

--
-- Name: source_control_provider_configs; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.source_control_provider_configs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    provider character varying(255) NOT NULL,
    "organizationId" integer NOT NULL,
    config jsonb NOT NULL
);


ALTER TABLE public.source_control_provider_configs OWNER TO retool_internal_user;

--
-- Name: source_control_relationships; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.source_control_relationships (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "elementUuid" uuid NOT NULL,
    "elementType" character varying(255) NOT NULL,
    "elementSaveId" integer,
    "branchId" uuid NOT NULL,
    "commitId" uuid,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "organizationId" integer
);


ALTER TABLE public.source_control_relationships OWNER TO retool_internal_user;

--
-- Name: COLUMN source_control_relationships."elementType"; Type: COMMENT; Schema: public; Owner: retool_internal_user
--

COMMENT ON COLUMN public.source_control_relationships."elementType" IS 'This field represents an enum of [''PAGE'']';


--
-- Name: source_control_repo_migration_logs; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.source_control_repo_migration_logs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "organizationId" integer NOT NULL,
    "migrationId" uuid NOT NULL,
    status character varying(255) NOT NULL,
    logs jsonb[],
    "branchName" character varying(255) NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.source_control_repo_migration_logs OWNER TO retool_internal_user;

--
-- Name: source_control_repo_migrations; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.source_control_repo_migrations (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "organizationId" integer NOT NULL,
    "fromVersion" character varying(255) NOT NULL,
    "toVersion" character varying(255) NOT NULL,
    status character varying(255) NOT NULL,
    "triggeredBy" integer,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.source_control_repo_migrations OWNER TO retool_internal_user;

--
-- Name: source_control_settings; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.source_control_settings (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "organizationId" integer NOT NULL,
    "enableAutoBranchNaming" boolean DEFAULT true NOT NULL,
    "enableCustomPullRequestTemplate" boolean DEFAULT false NOT NULL,
    "customPullRequestTemplate" text,
    "versionControlLocked" boolean
);


ALTER TABLE public.source_control_settings OWNER TO retool_internal_user;

--
-- Name: source_control_user_info; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.source_control_user_info (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "organizationId" integer NOT NULL,
    "userId" integer NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    head uuid
);


ALTER TABLE public.source_control_user_info OWNER TO retool_internal_user;

--
-- Name: COLUMN source_control_user_info.head; Type: COMMENT; Schema: public; Owner: retool_internal_user
--

COMMENT ON COLUMN public.source_control_user_info.head IS 'This field represents which branch is user is on';


--
-- Name: source_control_uuid_mappings; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.source_control_uuid_mappings (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "globalUuid" uuid NOT NULL,
    "elementUuid" uuid NOT NULL,
    "elementType" character varying(255) NOT NULL,
    "organizationId" integer NOT NULL
);


ALTER TABLE public.source_control_uuid_mappings OWNER TO retool_internal_user;

--
-- Name: ssh_keys; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.ssh_keys (
    id integer NOT NULL,
    "organizationId" integer NOT NULL,
    "privateKey" text,
    "publicKey" text,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


ALTER TABLE public.ssh_keys OWNER TO retool_internal_user;

--
-- Name: ssh_keys_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.ssh_keys_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.ssh_keys_id_seq OWNER TO retool_internal_user;

--
-- Name: ssh_keys_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.ssh_keys_id_seq OWNED BY public.ssh_keys.id;


--
-- Name: startup_programs; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.startup_programs (
    "organizationId" integer NOT NULL,
    "inStartupProgram" boolean NOT NULL,
    "isVoucherRedeemed" boolean NOT NULL,
    "enrolledAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "discountAmountUsd" numeric(12,2)
);


ALTER TABLE public.startup_programs OWNER TO retool_internal_user;

--
-- Name: storage_blobs; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.storage_blobs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "deletedAt" timestamp with time zone,
    "organizationId" integer,
    "creatorId" integer,
    mimetype character varying(255) NOT NULL,
    size integer NOT NULL,
    metadata json NOT NULL
);


ALTER TABLE public.storage_blobs OWNER TO retool_internal_user;

--
-- Name: tags; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.tags (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    "pageId" integer,
    "pageSaveId" integer,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    description text DEFAULT ''::text,
    "creatorUserId" integer,
    "releaserUserId" integer
);


ALTER TABLE public.tags OWNER TO retool_internal_user;

--
-- Name: temporal_cloud_settings; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.temporal_cloud_settings (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "organizationId" integer NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    region character varying(255),
    namespace character varying(255),
    "temporalCloudTlsConfigId" uuid,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.temporal_cloud_settings OWNER TO retool_internal_user;

--
-- Name: COLUMN temporal_cloud_settings.region; Type: COMMENT; Schema: public; Owner: retool_internal_user
--

COMMENT ON COLUMN public.temporal_cloud_settings.region IS 'Temporal Cloud region, e.g. us-east-1';


--
-- Name: COLUMN temporal_cloud_settings.namespace; Type: COMMENT; Schema: public; Owner: retool_internal_user
--

COMMENT ON COLUMN public.temporal_cloud_settings.namespace IS 'namespace from licensing server (orgSid + temporal suffix)';


--
-- Name: COLUMN temporal_cloud_settings."temporalCloudTlsConfigId"; Type: COMMENT; Schema: public; Owner: retool_internal_user
--

COMMENT ON COLUMN public.temporal_cloud_settings."temporalCloudTlsConfigId" IS 'mTLS authentication config currently in use';


--
-- Name: temporal_cloud_tls_configs; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.temporal_cloud_tls_configs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "organizationId" integer NOT NULL,
    namespace character varying(255) NOT NULL,
    "tlsCrt" text NOT NULL,
    "tlsKey" text NOT NULL,
    "tlsCrtExpiresAt" timestamp with time zone NOT NULL,
    "tlsCA" text NOT NULL,
    "tlsCAExpiresAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.temporal_cloud_tls_configs OWNER TO retool_internal_user;

--
-- Name: COLUMN temporal_cloud_tls_configs.namespace; Type: COMMENT; Schema: public; Owner: retool_internal_user
--

COMMENT ON COLUMN public.temporal_cloud_tls_configs.namespace IS 'namespace for this mTLS authentication';


--
-- Name: COLUMN temporal_cloud_tls_configs."tlsCrt"; Type: COMMENT; Schema: public; Owner: retool_internal_user
--

COMMENT ON COLUMN public.temporal_cloud_tls_configs."tlsCrt" IS 'End-entity certificate generated by signing certificate request with CA key';


--
-- Name: COLUMN temporal_cloud_tls_configs."tlsKey"; Type: COMMENT; Schema: public; Owner: retool_internal_user
--

COMMENT ON COLUMN public.temporal_cloud_tls_configs."tlsKey" IS 'Private key for the end-entity certificate';


--
-- Name: COLUMN temporal_cloud_tls_configs."tlsCrtExpiresAt"; Type: COMMENT; Schema: public; Owner: retool_internal_user
--

COMMENT ON COLUMN public.temporal_cloud_tls_configs."tlsCrtExpiresAt" IS 'Expiration date of the end-entity certificate';


--
-- Name: COLUMN temporal_cloud_tls_configs."tlsCA"; Type: COMMENT; Schema: public; Owner: retool_internal_user
--

COMMENT ON COLUMN public.temporal_cloud_tls_configs."tlsCA" IS 'Public Certificate Authority (CA) certificate; its private key sibling is used to sign the end-entity certificate';


--
-- Name: COLUMN temporal_cloud_tls_configs."tlsCAExpiresAt"; Type: COMMENT; Schema: public; Owner: retool_internal_user
--

COMMENT ON COLUMN public.temporal_cloud_tls_configs."tlsCAExpiresAt" IS 'Expiration date of the CA certificate';


--
-- Name: themes; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.themes (
    id integer NOT NULL,
    "logoFileName" character varying(255),
    "headerBackgroundColor" character varying(255),
    "logoFile" bytea,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "hideRetoolPill" boolean DEFAULT false,
    "headerModulePageId" integer,
    "headerApplyType" character varying(255),
    "showHeaderLogo" boolean DEFAULT false NOT NULL,
    "showLoginLogo" boolean DEFAULT false NOT NULL,
    "retoolPillAppearance" character varying(255) DEFAULT 'DEFAULT'::character varying NOT NULL,
    "faviconFileName" character varying(255),
    "faviconFile" bytea,
    "orgDisplayName" character varying(255),
    "hideRetoolReferences" boolean DEFAULT false NOT NULL,
    "accentColor" character varying(255),
    "themeConfigs" jsonb,
    "logoFileUrl" character varying(255),
    "faviconFileUrl" character varying(255),
    "intercomAppId" character varying(255),
    "intercomIdentityVerificationKey" character varying(255)
);


ALTER TABLE public.themes OWNER TO retool_internal_user;

--
-- Name: themes_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.themes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.themes_id_seq OWNER TO retool_internal_user;

--
-- Name: themes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.themes_id_seq OWNED BY public.themes.id;


--
-- Name: tracked_property_usages; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.tracked_property_usages (
    id integer NOT NULL,
    "propertyIdentifier" character varying(255) NOT NULL,
    "propertyType" character varying(255) NOT NULL,
    "pageId" integer,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


ALTER TABLE public.tracked_property_usages OWNER TO retool_internal_user;

--
-- Name: tracked_property_usages_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.tracked_property_usages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.tracked_property_usages_id_seq OWNER TO retool_internal_user;

--
-- Name: tracked_property_usages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.tracked_property_usages_id_seq OWNED BY public.tracked_property_usages.id;


--
-- Name: user_groups; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.user_groups (
    id integer NOT NULL,
    "userId" integer,
    "groupId" integer,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "isAdmin" boolean DEFAULT false NOT NULL
);


ALTER TABLE public.user_groups OWNER TO retool_internal_user;

--
-- Name: user_groups_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.user_groups_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.user_groups_id_seq OWNER TO retool_internal_user;

--
-- Name: user_groups_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.user_groups_id_seq OWNED BY public.user_groups.id;


--
-- Name: user_invite_groups; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.user_invite_groups (
    id integer NOT NULL,
    "userInviteId" integer,
    "groupId" integer,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


ALTER TABLE public.user_invite_groups OWNER TO retool_internal_user;

--
-- Name: user_invite_groups_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.user_invite_groups_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.user_invite_groups_id_seq OWNER TO retool_internal_user;

--
-- Name: user_invite_groups_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.user_invite_groups_id_seq OWNED BY public.user_invite_groups.id;


--
-- Name: user_invite_suggestions; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.user_invite_suggestions (
    id integer NOT NULL,
    "suggestedEmail" character varying(255) NOT NULL,
    "suggestedById" integer,
    "organizationId" integer NOT NULL,
    status public.enum_user_invite_suggestions_status NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone,
    "updatedById" integer,
    "updateViewedBySuggester" boolean DEFAULT false NOT NULL
);


ALTER TABLE public.user_invite_suggestions OWNER TO retool_internal_user;

--
-- Name: user_invite_suggestions_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.user_invite_suggestions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.user_invite_suggestions_id_seq OWNER TO retool_internal_user;

--
-- Name: user_invite_suggestions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.user_invite_suggestions_id_seq OWNED BY public.user_invite_suggestions.id;


--
-- Name: user_invites; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.user_invites (
    id integer NOT NULL,
    "invitedById" integer NOT NULL,
    "organizationId" integer NOT NULL,
    email character varying(255) NOT NULL,
    "signupToken" character varying(255) NOT NULL,
    expires timestamp with time zone NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "claimedById" integer,
    "claimedAt" timestamp with time zone,
    "userType" character varying(255) DEFAULT 'default'::character varying,
    metadata jsonb
);


ALTER TABLE public.user_invites OWNER TO retool_internal_user;

--
-- Name: user_invites_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.user_invites_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.user_invites_id_seq OWNER TO retool_internal_user;

--
-- Name: user_invites_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.user_invites_id_seq OWNED BY public.user_invites.id;


--
-- Name: user_login_ip_addresses; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.user_login_ip_addresses (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "userId" integer NOT NULL,
    "ipAddress" character varying(255) NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.user_login_ip_addresses OWNER TO retool_internal_user;

--
-- Name: user_session_states; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.user_session_states (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "userId" integer NOT NULL,
    "resourceId" integer,
    key character varying(255),
    value text,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


ALTER TABLE public.user_session_states OWNER TO retool_internal_user;

--
-- Name: user_viewed_features; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.user_viewed_features (
    id integer NOT NULL,
    "featureKey" character varying(255) NOT NULL,
    count integer DEFAULT 0 NOT NULL,
    dismissed boolean DEFAULT false NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "userId" integer
);


ALTER TABLE public.user_viewed_features OWNER TO retool_internal_user;

--
-- Name: user_viewed_features_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.user_viewed_features_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.user_viewed_features_id_seq OWNER TO retool_internal_user;

--
-- Name: user_viewed_features_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.user_viewed_features_id_seq OWNED BY public.user_viewed_features.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.users (
    id integer NOT NULL,
    email character varying(255),
    "firstName" character varying(255),
    "lastName" character varying(255),
    "profilePhotoUrl" text,
    "googleId" character varying(255),
    "googleToken" text,
    "hashedPassword" character varying(255),
    "organizationId" integer,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "lastLoggedIn" timestamp with time zone,
    enabled boolean DEFAULT true NOT NULL,
    "resetPasswordToken" character varying(255) DEFAULT NULL::character varying,
    "resetPasswordExpires" timestamp with time zone,
    sid character varying(255) DEFAULT ('user_'::text || replace((public.uuid_generate_v4())::text, '-'::text, ''::text)) NOT NULL,
    "userName" character varying(255),
    "twoFactorAuthSecret" character varying(255),
    "twoFactorAuthEnabled" boolean,
    "lastActive" timestamp with time zone,
    "salesCTADismissed" boolean DEFAULT false NOT NULL,
    "tutorialCTADismissed" boolean DEFAULT false NOT NULL,
    "passwordExpiresAt" timestamp with time zone,
    "passwordlessToken" character varying(255),
    "passwordlessTokenExpiresAt" timestamp with time zone,
    "userType" character varying(255) DEFAULT 'default'::character varying,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    "externalIdentifier" character varying(255),
    "githubId" integer
);


ALTER TABLE public.users OWNER TO retool_internal_user;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.users_id_seq OWNER TO retool_internal_user;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: vectors; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.vectors (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    namespace character varying(255) NOT NULL,
    description character varying(255) NOT NULL,
    type character varying(255) NOT NULL,
    configurations jsonb NOT NULL,
    "organizationId" integer NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.vectors OWNER TO retool_internal_user;

--
-- Name: vscode_sessions; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.vscode_sessions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "organizationId" integer NOT NULL,
    "userEmail" character varying(255) NOT NULL,
    "sessionUuid" character varying(255) NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.vscode_sessions OWNER TO retool_internal_user;

--
-- Name: vscode_types; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.vscode_types (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "organizationId" integer NOT NULL,
    "appUuid" character varying(255) NOT NULL,
    files jsonb NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.vscode_types OWNER TO retool_internal_user;

--
-- Name: workflow; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.workflow (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "organizationId" integer NOT NULL,
    name character varying(255) NOT NULL,
    description character varying(255),
    crontab character varying(255),
    timezone character varying(255),
    "isEnabled" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "apiKey" text,
    "releaseId" uuid,
    "createdBy" integer,
    "folderId" integer NOT NULL,
    protected boolean DEFAULT false NOT NULL,
    "autoEnableLatest" boolean DEFAULT false NOT NULL,
    "lastSyncedChecksum" character varying(255),
    "deletedAt" timestamp with time zone
);


ALTER TABLE public.workflow OWNER TO retool_internal_user;

--
-- Name: COLUMN workflow.name; Type: COMMENT; Schema: public; Owner: retool_internal_user
--

COMMENT ON COLUMN public.workflow.name IS 'A non-unique name for the workflow.';


--
-- Name: COLUMN workflow.description; Type: COMMENT; Schema: public; Owner: retool_internal_user
--

COMMENT ON COLUMN public.workflow.description IS 'A brief description of the workflow.';


--
-- Name: COLUMN workflow.crontab; Type: COMMENT; Schema: public; Owner: retool_internal_user
--

COMMENT ON COLUMN public.workflow.crontab IS 'A UNIX style crontab at which to run this workflow.';


--
-- Name: COLUMN workflow.timezone; Type: COMMENT; Schema: public; Owner: retool_internal_user
--

COMMENT ON COLUMN public.workflow.timezone IS 'The timezone that the crontab applies to. If null, UTC is assumed. An example value is "America/Los_Angeles"';


--
-- Name: workflow_aggregate_usage; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.workflow_aggregate_usage (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "organizationId" integer NOT NULL,
    "totalInputDataSizeBytes" bigint NOT NULL,
    "totalOutputDataSizeBytes" bigint NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "periodStart" timestamp with time zone NOT NULL,
    "periodEnd" timestamp with time zone NOT NULL,
    "workflowId" uuid,
    "billableRunsCount" bigint
);


ALTER TABLE public.workflow_aggregate_usage OWNER TO retool_internal_user;

--
-- Name: workflow_block_result_location_enum; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.workflow_block_result_location_enum (
    id character varying(255) NOT NULL
);


ALTER TABLE public.workflow_block_result_location_enum OWNER TO retool_internal_user;

--
-- Name: workflow_block_results; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.workflow_block_results (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "organizationId" integer NOT NULL,
    "resultDataBlob" bytea NOT NULL,
    "dataExpiresAt" timestamp with time zone NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "compressionScheme" character varying(255)
);
ALTER TABLE ONLY public.workflow_block_results ALTER COLUMN "resultDataBlob" SET STORAGE EXTERNAL;


ALTER TABLE public.workflow_block_results OWNER TO retool_internal_user;

--
-- Name: workflow_block_runs; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.workflow_block_runs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "organizationId" integer NOT NULL,
    "workflowId" uuid NOT NULL,
    "workflowRunId" uuid NOT NULL,
    "blockPluginId" character varying(255) NOT NULL,
    "blockResultLocation" character varying(255) NOT NULL,
    "blockResultKey" character varying(255) NOT NULL,
    "inputDataSizeBytes" bigint,
    "outputDataSizeBytes" bigint,
    status character varying(255) NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "dataExpiresAt" timestamp with time zone NOT NULL
);


ALTER TABLE public.workflow_block_runs OWNER TO retool_internal_user;

--
-- Name: workflow_compression_scheme_enum; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.workflow_compression_scheme_enum (
    id character varying(255) NOT NULL
);


ALTER TABLE public.workflow_compression_scheme_enum OWNER TO retool_internal_user;

--
-- Name: workflow_release; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.workflow_release (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(255),
    description character varying(255),
    "workflowId" uuid NOT NULL,
    "workflowSaveId" uuid NOT NULL,
    "creatorUserId" integer,
    "releaserUserId" integer,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "commitMessage" text,
    "gitSha" character varying(255)
);


ALTER TABLE public.workflow_release OWNER TO retool_internal_user;

--
-- Name: workflow_run; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.workflow_run (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "workflowId" uuid NOT NULL,
    status character varying(255) DEFAULT 'PENDING'::character varying NOT NULL,
    "logFile" character varying(255),
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "createdBy" integer,
    "inputDataSizeBytes" bigint,
    "outputDataSizeBytes" bigint,
    "completedAt" timestamp with time zone,
    "workflowSaveId" uuid,
    "triggerType" character varying(255),
    "blobDataDeletedAt" timestamp with time zone,
    "triggerId" uuid,
    "environmentId" uuid,
    "callingRetoolEvent" character varying(255)
);


ALTER TABLE public.workflow_run OWNER TO retool_internal_user;

--
-- Name: COLUMN workflow_run.status; Type: COMMENT; Schema: public; Owner: retool_internal_user
--

COMMENT ON COLUMN public.workflow_run.status IS 'The status of the run - really an enum with values of PENDING, IN_PROGRESS, SUCCESS, FAILURE';


--
-- Name: COLUMN workflow_run."logFile"; Type: COMMENT; Schema: public; Owner: retool_internal_user
--

COMMENT ON COLUMN public.workflow_run."logFile" IS 'The path to the logs for the run.';


--
-- Name: workflow_run_logs; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.workflow_run_logs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "organizationId" integer NOT NULL,
    "workflowId" uuid NOT NULL,
    "workflowRunId" uuid NOT NULL,
    "blockPluginId" character varying(255) NOT NULL,
    "numRetry" integer NOT NULL,
    "sequenceToken" integer NOT NULL,
    "logData" bytea NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "compressionScheme" character varying(255)
);
ALTER TABLE ONLY public.workflow_run_logs ALTER COLUMN "logData" SET STORAGE EXTERNAL;


ALTER TABLE public.workflow_run_logs OWNER TO retool_internal_user;

--
-- Name: workflow_save; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.workflow_save (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "workflowId" uuid NOT NULL,
    "blockData" jsonb,
    "templateData" jsonb,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "triggerWebhooks" jsonb,
    "createdBy" integer,
    "customLibraries" jsonb,
    "pythonLanguageConfigurationId" uuid,
    "javascriptLanguageConfigurationId" uuid,
    "setupScripts" jsonb,
    "pythonLanguageConfigurationSaveId" uuid,
    "javascriptLanguageConfigurationSaveId" uuid
);


ALTER TABLE public.workflow_save OWNER TO retool_internal_user;

--
-- Name: COLUMN workflow_save."blockData"; Type: COMMENT; Schema: public; Owner: retool_internal_user
--

COMMENT ON COLUMN public.workflow_save."blockData" IS 'The blocks in the workflow. See typescript type for expected structure.';


--
-- Name: COLUMN workflow_save."templateData"; Type: COMMENT; Schema: public; Owner: retool_internal_user
--

COMMENT ON COLUMN public.workflow_save."templateData" IS 'The serialized template of the workflow.';


--
-- Name: COLUMN workflow_save."triggerWebhooks"; Type: COMMENT; Schema: public; Owner: retool_internal_user
--

COMMENT ON COLUMN public.workflow_save."triggerWebhooks" IS 'A column to store webhooks definition that can be used to start the workflow. See typescript type for expected structure.';


--
-- Name: COLUMN workflow_save."customLibraries"; Type: COMMENT; Schema: public; Owner: retool_internal_user
--

COMMENT ON COLUMN public.workflow_save."customLibraries" IS 'A column to store the custom libraries being used in the workflow. Expected structure is {library: variable}.';


--
-- Name: COLUMN workflow_save."setupScripts"; Type: COMMENT; Schema: public; Owner: retool_internal_user
--

COMMENT ON COLUMN public.workflow_save."setupScripts" IS 'Language specific global configurations for workflows.';


--
-- Name: workflow_tracked_property_usages; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.workflow_tracked_property_usages (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "propertyIdentifier" character varying(255) NOT NULL,
    "propertyType" character varying(255) NOT NULL,
    "workflowId" uuid NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.workflow_tracked_property_usages OWNER TO retool_internal_user;

--
-- Name: workflow_trigger; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.workflow_trigger (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "workflowId" uuid NOT NULL,
    "environmentId" uuid,
    "triggerType" character varying(255) NOT NULL,
    "enabledAt" timestamp with time zone,
    "triggerOptions" jsonb,
    "createdBy" integer,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.workflow_trigger OWNER TO retool_internal_user;

--
-- Name: COLUMN workflow_trigger."triggerOptions"; Type: COMMENT; Schema: public; Owner: retool_internal_user
--

COMMENT ON COLUMN public.workflow_trigger."triggerOptions" IS 'schedule or trigger specific options. See typescript type for expected structure.';


--
-- Name: workspaces; Type: TABLE; Schema: public; Owner: retool_internal_user
--

CREATE TABLE public.workspaces (
    id integer NOT NULL,
    "groupId" integer NOT NULL,
    "homePageId" integer,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


ALTER TABLE public.workspaces OWNER TO retool_internal_user;

--
-- Name: workspaces_id_seq; Type: SEQUENCE; Schema: public; Owner: retool_internal_user
--

CREATE SEQUENCE public.workspaces_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.workspaces_id_seq OWNER TO retool_internal_user;

--
-- Name: workspaces_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: retool_internal_user
--

ALTER SEQUENCE public.workspaces_id_seq OWNED BY public.workspaces.id;


--
-- Name: app_metadata id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.app_metadata ALTER COLUMN id SET DEFAULT nextval('public.app_metadata_id_seq'::regclass);


--
-- Name: app_themes id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.app_themes ALTER COLUMN id SET DEFAULT nextval('public.app_themes_id_seq'::regclass);


--
-- Name: audit_trail_events id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.audit_trail_events ALTER COLUMN id SET DEFAULT nextval('public.audit_trail_events_id_seq'::regclass);


--
-- Name: component_metadata id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.component_metadata ALTER COLUMN id SET DEFAULT nextval('public.component_metadata_id_seq'::regclass);


--
-- Name: custom_component_collection_revision_files id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.custom_component_collection_revision_files ALTER COLUMN id SET DEFAULT nextval('public.custom_component_collection_revision_files_id_seq'::regclass);


--
-- Name: custom_component_collection_revisions id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.custom_component_collection_revisions ALTER COLUMN id SET DEFAULT nextval('public.custom_component_collection_revisions_id_seq'::regclass);


--
-- Name: custom_component_collections id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.custom_component_collections ALTER COLUMN id SET DEFAULT nextval('public.custom_component_collections_id_seq'::regclass);


--
-- Name: embeds id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.embeds ALTER COLUMN id SET DEFAULT nextval('public.embeds_id_seq'::regclass);


--
-- Name: experiment_audiences id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.experiment_audiences ALTER COLUMN id SET DEFAULT nextval('public.experiment_audiences_id_seq'::regclass);


--
-- Name: experiment_strategies id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.experiment_strategies ALTER COLUMN id SET DEFAULT nextval('public.experiment_strategies_id_seq'::regclass);


--
-- Name: experiments id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.experiments ALTER COLUMN id SET DEFAULT nextval('public.experiments_id_seq'::regclass);


--
-- Name: features id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.features ALTER COLUMN id SET DEFAULT nextval('public.features_id_seq'::regclass);


--
-- Name: flow_input_schemas id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.flow_input_schemas ALTER COLUMN id SET DEFAULT nextval('public.flow_input_schemas_id_seq'::regclass);


--
-- Name: flow_queries id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.flow_queries ALTER COLUMN id SET DEFAULT nextval('public.flow_queries_id_seq'::regclass);


--
-- Name: flow_stages id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.flow_stages ALTER COLUMN id SET DEFAULT nextval('public.flow_stages_id_seq'::regclass);


--
-- Name: flow_task_histories id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.flow_task_histories ALTER COLUMN id SET DEFAULT nextval('public.flow_task_histories_id_seq'::regclass);


--
-- Name: flow_task_inputs id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.flow_task_inputs ALTER COLUMN id SET DEFAULT nextval('public.flow_task_inputs_id_seq'::regclass);


--
-- Name: flow_tasks id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.flow_tasks ALTER COLUMN id SET DEFAULT nextval('public.flow_tasks_id_seq'::regclass);


--
-- Name: flows id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.flows ALTER COLUMN id SET DEFAULT nextval('public.flows_id_seq'::regclass);


--
-- Name: folder_favorites id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.folder_favorites ALTER COLUMN id SET DEFAULT nextval('public.folder_favorites_id_seq'::regclass);


--
-- Name: folders id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.folders ALTER COLUMN id SET DEFAULT nextval('public.folders_id_seq'::regclass);


--
-- Name: group_folder_defaults id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.group_folder_defaults ALTER COLUMN id SET DEFAULT nextval('public.group_folder_defaults_id_seq'::regclass);


--
-- Name: group_pages id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.group_pages ALTER COLUMN id SET DEFAULT nextval('public.group_pages_id_seq'::regclass);


--
-- Name: group_resource_folder_defaults id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.group_resource_folder_defaults ALTER COLUMN id SET DEFAULT nextval('public.group_resource_folder_defaults_id_seq'::regclass);


--
-- Name: group_resources id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.group_resources ALTER COLUMN id SET DEFAULT nextval('public.group_resources_id_seq'::regclass);


--
-- Name: group_workflows id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.group_workflows ALTER COLUMN id SET DEFAULT nextval('public.group_workflows_id_seq'::regclass);


--
-- Name: groups id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.groups ALTER COLUMN id SET DEFAULT nextval('public.groups_id_seq'::regclass);


--
-- Name: instrumentation_integrations id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.instrumentation_integrations ALTER COLUMN id SET DEFAULT nextval('public.instrumentation_integrations_id_seq'::regclass);


--
-- Name: organizations id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.organizations ALTER COLUMN id SET DEFAULT nextval('public.organizations_id_seq'::regclass);


--
-- Name: page_favorites id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.page_favorites ALTER COLUMN id SET DEFAULT nextval('public.page_favorites_id_seq'::regclass);


--
-- Name: page_save_playground_query_saves id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.page_save_playground_query_saves ALTER COLUMN id SET DEFAULT nextval('public.page_save_playground_query_saves_id_seq'::regclass);


--
-- Name: page_saves id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.page_saves ALTER COLUMN id SET DEFAULT nextval('public.page_saves_id_seq'::regclass);


--
-- Name: pages id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.pages ALTER COLUMN id SET DEFAULT nextval('public.pages_id_seq'::regclass);


--
-- Name: plan_features id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.plan_features ALTER COLUMN id SET DEFAULT nextval('public.plan_features_id_seq'::regclass);


--
-- Name: plans id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.plans ALTER COLUMN id SET DEFAULT nextval('public.plans_id_seq'::regclass);


--
-- Name: playground_queries id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.playground_queries ALTER COLUMN id SET DEFAULT nextval('public.playground_queries_id_seq'::regclass);


--
-- Name: playground_query_saves id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.playground_query_saves ALTER COLUMN id SET DEFAULT nextval('public.playground_query_saves_id_seq'::regclass);


--
-- Name: query_metadata id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.query_metadata ALTER COLUMN id SET DEFAULT nextval('public.query_metadata_id_seq'::regclass);


--
-- Name: resource_folders id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.resource_folders ALTER COLUMN id SET DEFAULT nextval('public.resource_folders_id_seq'::regclass);


--
-- Name: resources id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.resources ALTER COLUMN id SET DEFAULT nextval('public.resources_id_seq'::regclass);


--
-- Name: retool_databases id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.retool_databases ALTER COLUMN id SET DEFAULT nextval('public.retool_databases_id_seq'::regclass);


--
-- Name: retool_db_provision id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.retool_db_provision ALTER COLUMN id SET DEFAULT nextval('public.retool_db_provision_id_seq'::regclass);


--
-- Name: retool_managed_note id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.retool_managed_note ALTER COLUMN id SET DEFAULT nextval('public.retool_managed_note_id_seq'::regclass);


--
-- Name: retool_managed_note_comment id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.retool_managed_note_comment ALTER COLUMN id SET DEFAULT nextval('public.retool_managed_note_comment_id_seq'::regclass);


--
-- Name: retool_table_events id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.retool_table_events ALTER COLUMN id SET DEFAULT nextval('public.retool_table_events_id_seq'::regclass);


--
-- Name: retool_tables id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.retool_tables ALTER COLUMN id SET DEFAULT nextval('public.retool_tables_id_seq'::regclass);


--
-- Name: role_pages_members id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.role_pages_members ALTER COLUMN id SET DEFAULT nextval('public.role_pages_members_id_seq'::regclass);


--
-- Name: sessions id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.sessions ALTER COLUMN id SET DEFAULT nextval('public.sessions_id_seq'::regclass);


--
-- Name: ssh_keys id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.ssh_keys ALTER COLUMN id SET DEFAULT nextval('public.ssh_keys_id_seq'::regclass);


--
-- Name: themes id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.themes ALTER COLUMN id SET DEFAULT nextval('public.themes_id_seq'::regclass);


--
-- Name: tracked_property_usages id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.tracked_property_usages ALTER COLUMN id SET DEFAULT nextval('public.tracked_property_usages_id_seq'::regclass);


--
-- Name: user_groups id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.user_groups ALTER COLUMN id SET DEFAULT nextval('public.user_groups_id_seq'::regclass);


--
-- Name: user_invite_groups id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.user_invite_groups ALTER COLUMN id SET DEFAULT nextval('public.user_invite_groups_id_seq'::regclass);


--
-- Name: user_invite_suggestions id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.user_invite_suggestions ALTER COLUMN id SET DEFAULT nextval('public.user_invite_suggestions_id_seq'::regclass);


--
-- Name: user_invites id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.user_invites ALTER COLUMN id SET DEFAULT nextval('public.user_invites_id_seq'::regclass);


--
-- Name: user_viewed_features id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.user_viewed_features ALTER COLUMN id SET DEFAULT nextval('public.user_viewed_features_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: workspaces id; Type: DEFAULT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.workspaces ALTER COLUMN id SET DEFAULT nextval('public.workspaces_id_seq'::regclass);


--
-- Data for Name: SequelizeMeta; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public."SequelizeMeta" (name) FROM stdin;
20170517054913-create-organization-and-user.js
20170519200903-create-page.js
20170519213338-create-page-save.js
20170521042445-create-resource.js
20170605055605-remove-non-null-constraint-on-organizations-domain.js
20170626044218-relax-constraints-for-non-db-resources.js
20170627021252-change-user-google-token-to-text-type.js
20170718030743-create-embed.js
20170725114241-create-retool-tables.js
20170801045015-add-database-id-table-name-uniq-constraint.js
20170801051119-add-ssl-column-to-resources.js
20170827134431-add-edit-privilege-to-resources.js
20170901033536-create-user-invites.js
20170904120915-add-option-column-to-resource.js
20170905163559-add-claimed-data-to-user-invites.js
20170908044721-camel-case-organization-id.js
20170908045940-camel-case-foreign-keys.js
20170908072236-create-groups.js
20170910220055-create-group-pages.js
20170911174211-add-unique-constraints-to-group-relations.js
20170913082842-change-json-columns-to-jsonb.js
20171007195513-create-user-invite-groups.js
20171128020917-add-password-to-embeds.js
20171211042535-add-verified-to-organizations.js
20171211043343-add-unique-constraint-to-organizations-name.js
20180105093546-create-audit-trail.js
20180121060558-add-last-logged-in-to-users.js
20180121081341-add-subdomain-to-organizations.js
20180125074833-add-metadata-to-audit-trail-event.js
20180314185313-create-folders.js
20180315005524-create-root-folders-for-orgs.js
20180315070506-add-uuid-to-pages.js
20180315202022-migrate-retool-buttons.js
20180325033649-fix-root-archive-structure.js
20180411230500-create-block.js
20180501214644-add-all-users-groups.js
20180509014253-create-tags-for-page-saves.js
20180512065556-add-enabled-to-users.js
20180525085038-add-environment-to-resources.js
20180601052843-create-user-session-state.js
20180621213631-convert-user-session-state-value-to-text.js
20180626225357-add-dynamically-queryable-to-resources.js
20180717013847-add-trial-to-cloud-users.js
20180719084641-create-sessions.js
20180720192034-add-reset-password.js
20180722013936-add-preload-javascript-and-javascript-links-to-organization.js
20180722022334-add-git-url-to-organization.js
20180722034753-add-changes-record-to-page-saves.js
20180724231554-add-user-to-page-save.js
20180730035637-create-plan.js
20180730041107-create-feature.js
20180806190311-add-stripe-customer-to-orgs.js
20180807005222-store-card-identifiers.js
20180807231432-add-stripe-reference-to-plans.js
20180808035938-add-subscriptions-to-organizations.js
20180820212043-add-billing-metadata-to-organizations.js
20180823030603-add-min-seats-to-plans.js
20180910200222-add-preloaded-css.js
20180910201302-convert-preloaded-to-text.js
20181001021553-add-public-id-to-users.js
20181004031428-add-phone-and-company.js
20181025035442-add-user-name-to-users.js
20190116012339-create-ssh-keys.js
20190121071059-add-git-branch-to-organizations.js
20190128005542-add-indices-to-audit-trail-events.js
20190131050840-add-2fa-token-to-users.js
20190203223343-add-more-indices-to-audit-trail-events.js
20190206130245-add-2fa-required-to-organizations.js
20190501042420-create-playground-query-and-playground-query-save.js
20190505070623-add-last-active-to-users.js
20190517153817-create-page-favorites.js
20190519110549-add-column-pages-photo-url.js
20190523163036-add-column-homepage-preloaded-css.js
20190526195058-create-group-resources.js
20190528141948-create-page-user-heartbeats.js
20190529143048-add-column-pages-deleted.js
20190629001631-add-column-onboarding-checklist.js
20190710194607-set-playground-query-save-on-delete-cascade.js
20190804182451-add-column-tag-description.js
20190809180847-create-experiments.js
20190812022830-create-experiments-deleted-at-column.js
20190820051248-create-idpMetadataXML-column.js
20190825193917-idpMetadataXML-to-text.js
20190830021143-add-state-to-sessions.js
20190913004256-create-retool-managed-note.js
20190926185409-add-uuid-to-playground-query.js
20190926225559-create-page-save-query-save-table.js
20191004073210-add-jit-saml-user-provisioning-to-organizations.js
20191007004015-drop-organizations-verified-column.js
20191007225034-create-approval-table.js
20191022003213-create-retool-managed-note-comment.js
20191025190326-google-photo-as-text-field.js
20191029012607-create-api-keys.js
20191115211147-add-library-access-controls-to-groups.js
20191116032755-add-page-id-query-id-to-page-save-playground-query-save.js
20191119183055-backfill-page-save-playground-query-save.js
20191204200513-approval-task-on-delete-cascade.js
20191204224653-create-app-metadata-tables.js
20200117001411-add-indices-to-metadata-tables.js
20200117221101-add-page-id-sorted-index-to-page-saves.js
20200314001058-add-onboardingStage-to-user.js
20200317004832-remove-onboardingStage-from-user.js
20200317020210-create-recently_visited_apps-table.js
20200318230009-wipe-out-onboardingChecklist.js
20200319001351-add-salesCTADismissed-to-user.js
20200319001405-add-tutorialCTADismissed-to-user.js
20200319080412-add-onboardingStage-to-user.js
20200410092658-add-lastEditedBy.js
20200410161606-add-theme-id-to-organization-and-create-themes.js
20200412171634-create-workspaces.js
20200416084658-create-user-invite-suggestions-table.js
20200419010412-add-favorited-to-folders.js
20200513233128-create-v1-flows-tables.js
20200519224444-add-licenseVerification-to-organizations.js
20200522163652-add-column-required-and-unique-to-flow-input-schemas.js
20200623174842-create-flow-task-histories.js
20200705213318-add-column-pages-is-global-widget.js
20200803175920-add-user-list-access-to-groups.js
20200804000000-convert-validation-url-to-configurable-rest-call.js
20200825185322-add-page-id-index-to-tags.js
20200917185402-create_organization_email_domains.js
20200923000000-create_partially_registered_users.js
20201001025033-change-flow_task_inputs-value-to-text.js
20201006142314-add-platform-level-auth-steps-to-organization.js
20201010024343-add-column-deletedAt-to-flowTasks.js
20201014213857-create-blob.js
20201022002601-disable-update_users_last_active_trigger.js
20201022172751-add_partial_index_to_user_invite_suggestions.js
20201022175548-add_auto_join_column_to_organization_email_domains.js
20201025221224-create-instrumentation-integrations.js
20201027183344-remove-citext.js
20201106000000-remove-non-null-from-partially-registered-user-password.js
20201110182704-create-app-themes.js
20201111203850-fix_organization_email_domain_column_names.js
20201116013135-create-usage-tracked-properties.js
20201120000001-page_add_protected.js
20201120000002-add_branches_table.js
20201120000003-add-page-save-branch.js
20201120000004-add_commits_table.js
20201120000005-page_add_synced.js
20201120000006-add_protected_repo.js
20201123185949-add_organization_id_index_to_users.js
20201129213514-add_page_save_id_index_to_tags.js
20201208190222-drop_profile_photo_pkey_constraint.js
20201211162854-create-experiment-strategy.js
20201214030645-add-cacheQueriesPerUser-to-organization.js.js
20201229190223-add_resource_preview_hint_tables.js
20210121031255-backfill-onprem-experiments.js
20210122004828-add-instrumentation-config.js
20210122203434-add-creator-and-releaser-user-id-to-tag.js
20210126010727-org_add_protected_base_url.js
20210201010727-org_add_protected_ui_url.js
20210205194413-add-description-to-pages.js
20210212190920-addPasswordExpiredToUsers.js
20210217020424-add-display-name-to-resources.js
20210306210856-create-group-folder-default.js
20210308191233-add-onprem-subscription-to-organization.js
20210310152048-add-planid-to-org.js
20210311193528-create-user-viewed-features.js
20210317160820-add-is-admin-column-to-user-groups.js
20210317160846-backfill-is-admin-column-on-user-groups.js
20210317160911-make-is-admin-on-user-groups-non-nullable.js
20210318011526-create-page-readme.js
20210322000000-add-checksum-to-page-save.js
20210324141659-extend-page-readme.js
20210324230508-add-last-edited-by-to-page-documentation.js
20210326205117-add-archived-at-to-groups.js
20210407160500-add-column-pages-clonedFromTemplateName.js
20210420051544-add-pgcrypto-extension.js
20210420202159-add-hide-retool-pill-to-theme.js
20210429043321-add_module_uuid_key_to_theme.js
20210504205959-add-pinned-to-latest-version-to-playground-query-usage.js
20210506231331-backfill-pinned-to-latest-version-on-playground-query-usage.js
20210506231755-make-pinned-to-latest-version-on-playground-query-usage-non-nullable.js
20210512000000-add-canary-to-org.js
20210526201600-add-protected-apps-sync-enabled-column-to-organizations.js
20210526223041-backfill-protected-apps-sync-enabled-column-on-organizations.js
20210527012348-make-protected-apps-sync-enabled-column-on-organizations-non-nullable.js
20210602200626-create-notebook-workflow.js
20210603161916-add-audit-log-access-to-groups.js
20210604211347-backfill-audit-log-access-on-groups.js
20210604212156-make-audit-log-access-non-nullable.js
20210608225513-update-resources-access-level-constraint.js
20210609175143-update-group-resources-access-level-constraint.js
20210614230814-org-startup-program.js
20210615184230-add-query-id-index-to-query-saves.js
20210620042700-create-notebook-workflow-run.js
20210621183636-add-intercom-toggle-to-org.js
20210621221154-startup-program-discount-column.js
20210621225353-backfill-enable-intercom-column-on-orgs.js
20210623164832-make-enableintercom-non-nullable.js
20210630120915-add-show-header-logo-to-themes.js
20210630173841-create-workflow-save-table.js
20210701120000-backfill-show-header-logo-on-themes.js
20210706175948-remove-enable-intercom-column.js
20210707162930-make-show-header-logo-non-nullable.js
20210708002200-add-show-login-logo-to-themes.js
20210708120000-backfill-show-login-logo-on-themes.js
20210708224112-make-show-login-logo-non-nullable.js
20210715155015-create-datagrid-tables.js
20210809155015-add-table-id-to-datagrid-activity.js
20210818053430-create-storage-blob.js
20210824155015-add-allow-schema-edit-setting-to-grid.js
20210825162745-add_pages_index.js
20210826232121-add_folders_index.js
20210830102542-add-column-pages-is-mobile-app.js
20210902174420-add_page_save_playground_query_saves_playground_query_id_idx.js
20210903174420-add_table_for_grid_saved_filtering.js
20210908193736-add-retool-pill-appearance.js
20210908202851-backfill-retool-pill-appearance.js
20210920202851-grid-add-schema-name.js
20210921000000-fix-instrumentation-integration-index.js
20210927215315-experiment-strategy-enum-to-string.js
20210930115315-grid-add-permissions-grid-user.js
20211006184435-add_pkey_to_organization_email_domains.js
202110071153155-grid-add-permissions-grid-table-user.js
20211007155502-create-page-onboarding-state-table.js
20211021203346-add_page_save_playground_query_saves_playground_query_id_idx.js
20211026180957-add-release-management-flag-to-organizations.js
20211026180959-make-release-management-flag-on-organizations-non-nullable.js
20211028000000-remove_user_index_from_audit_trail_events.js
20211028000001-remove_createdAt_index_from_audit_trail_events.js
20211028000002-remove_pageName_index_from_audit_trail_events.js
20211028000003-remove_queryName_index_from_audit_trail_events.js
20211028000004-add_user_index_to_audit_trail_events.js
20211028000005-add_createdAt_index_to_audit_trail_events.js
20211028000006-add_pageName_index_to_audit_trail_events.js
20211028000007-add_queryName_index_to_audit_trail_events.js
20211028000008-remove_org_index_from_audit_trail_events.js
202111011829100-backfill-admin-group-audit-log-access.js
20211102080459-create-environments-table.js
20211103051615-backfill-environments-table.js
20211109205911-grid-fix-grid-group-access-index.js
20211119012241-grid-onboarding-state.js
20211122235601-backfill-environment-id-on-resources.js
202112081829100-add-displayColor-constraint-on-environments.js
202112091829100-add-environmentId-to-organizations.js
202112141829100-remove-environmentId-to-organizations.js
202112141829200-add-isDefault-to-environments.js
202112141829300-backfill-isDefault-in-environments.js
202112141829400-make-isDefault-non-nullable-on-environments.js
202112141829500-add-unique-constraint-for-isDefault-on-environments.js
202112141829600-add-before-delete-trigger-on-environments.js
202112141829601-update-before-delete-function-on-environments.js
20211214194219-grid-create-field-config-table.js
202112251829900-make-orgId-non-nullable-on-resources.js
20220106000000-create-grid-managed-clusters.js
20220208054913-create-environment-config-vars-table.js
20220209023924-add-display-timezone-to-grid-field-config.js
20220223185435-create-resource-folders-tables.js
20220225222721-fix-resource-folder-constraints.js
20220301003124-add-folderid-column-to-resources.js
20220304211737-create_bad_passwords.js
20220307152605-add-workflows-columns-for-webhooks.js
20220308192108-workflow-save-createdAt-index.js
20220316202154-workflow-add-column-apiKey.js
20220317180738-fix-resource-folder-fkey.js
20220317201831-fix-resource-folder-root-unique-index.js
20220317201832-backfill-root-resource-folders.js
20220318225259-backfill-resource-folder-ids.js
20220322181710-move-resources-to-org-root.js
20220329224659-add-protected-column-to-resources.js
202204041829300-backfill-resouce-folder-id.js
20220413010135-add-author-id-column-to-resources.js
20220414215120-add-unpublished-release-access-to-groups.js
20220418180607-backfill-unpublished-release-access-on-groups.js
20220418182234-make-unpublished-release-access-on-groups-non-nullable.js
20220502164604-create-personal-access-tokens-table.js
20220511171607-backfill-resource-folder-id.js
20220512154710-create-workflow-releases.js
20220512220644-add-base-commit-to-branches.js
2022051230915-add-checksum-column-to-resources.js
20220517205824-update-pages-tags-foreign-key-constraint.js
20220518181011-update-pages-tags-foreign-key-constraints-validate.js
20220518210853-add_queryName_ordered_id_index_to_audit_trail_events.js
20220518211104-add_user_ordered_id_index_to_audit_trail_events.js
20220518211113-add_createdAt_ordered_id_index_to_audit_trail_events.js
20220518211125-add_pageName_ordered_id_index_to_audit_trail_events.js
20220529210632-add-passwordless-login-to-users.js
20220608220303-correct-hubspot-resource-settings.js
20220610213801-create-source-control-deployments-table.js
20220614195406-add-uuid-to-resources.js
20220615223734-backfill-workflow-releases.js
20220628140031-add-last4-to-access-tokens.js
20220706062537-create-source-control-deployment-settings-table.js
20220706234545-add-orgId-column-to-source-control-deployment-settings.js
20220707191537-source-control-deployment-organization-id-backfill.js
20220715142715-add-type-to-theme.js
20220808205657-add-identifier-pageid-index-global-widget-filter-to-tpu.js
20220808205858-add-id-index-global-widget-filter-to-tpu.js
20220819000147-create-group-workflows-relation.js
20220819000148-add-universalWorkflowAccess-column-to-groups.js
20220819000149-backfill-universalWorkflowAccess-column-in-groups.js
20220819000150-set-universalWorkflowAccess-column-in-groups-unnullable.js
20220819000151-set-universalWorkflowAccess-column-in-groups-constraints.js
20220831162045-add-createdBy-workflow-workflow-save.js
20220912163357-backfill-all-universal-workflow-access-in-groups.js
20220912202647-add-jobs-runner-heartbeat-to-source-control-deployment-settings.js
20220916235507-add-user-type-to-users.js
20220922201544-create-workflow-aggregate-usage-add-io-workflow-run-billing-cycle-org.js
20220927000110-add-exponential-backoff-to-source-control-deployment-settings.js
20220927070306-add-triggered-by-to-source-control-deployments.js
20220928155949-add_organization_id_index_to_ssh_keys.js
20220928174027-add-workflow-id-workflow-aggregate-usage.js
20220928185626-backfill-exponential-backoff-to-source-control-deployment-settings.js
20220928185633-make--exponential-backoff-to-source-control-deployment-settings-non-nullable.js
20220929185633-add-retooldb-limit-config-to-organization.js
20220930163609-change-workflow-run-bytes-usage-type.js
20221003132723-add-workflow-type-to-folders.js
20221003132725-create-root-folders-index.js
20221003132726-drop-root-folders-index.js
20221003133855-create-non-root-folders-index.js
20221003134104-drop-non-root-folders-index.js
20221003134105-backfill-folderType-column-on-folders.js
20221003134106-backfill-root-workflow-folders-in-folders.js
20221004180140-create-external-users-table.js
20221006055506-resources-password-column-char-to-text.js
20221006170746-drop-date-add-boundary-times-to-workflow-aggregate-usage.js
20221013155949-add_recently_visited_apps_user_id.js
20221016155949-add_user_invites_org_id.js
20221017144425-create-completed-at-on-workflow-run.js
20221017144430-move-workflows-to-root-if-folderId-null.js
20221017144440-make-folderType-on-folders-nonnullable-after-backfill.js
20221017144450-create-folderid-index-on-workflow.js
20221017144460-create-archive-workflow-folders.js
20221017155949-add_organization_id_resource_folders.js
20221017223125-temp-released-tag-id.js
20221018001332-enable-releases-modules.js
20221018031144-add-user-type-to-users-invites.js
20221019043929-backfill-workflow-editor-permissions-for-app-editors.js
20221021175911-create-workflow-block-results.js
20221024223518-create-external-embed-sessions-table.js
20221027143300-change-workflow-on-delete-for-aggregate-table.js
20221028223828-create-workflow-run-index-on-workflowId-createdAt.js
20221028223923-drop-workflow-run-index-on-workflowId.js
20221103155949-add_experiment_strategies_target_id_strategy.js
20221103155949-add_tracked_property_usages_pageid.js
20221103175857-create-workflow-block-result-location-enum.js
20221110155451-create-workflow-run-logs.js
20221205220334-backfill-mongodb-client-cert-and-key.js
20221206005214-workflows-clientside-compress-blobs-and-logs.js
20221207231321-update-workflow-logs-and-blocks-to-cascade-delete.js
20221208161438-add-custom-libraries.js
20230105195208-hubspot-resource-scope-change.js
20230106171911-add-workflow-source-control-columns.js
20230112000000-add-retooldb-migrations.js
20230118003933-migrate-ssl-host-to-verification-mode.js
20230121021753-add-source-control-email-flag-to-organizations.js
20230124181817-backfill-grpc-certs.js
20230127004456-create-source-control-protection-status-table.js
20230127193220-backfill-cassandra-ssl.js
20230201002340-add-metadata-column-to-users-table.js
20230201004538-create-source-control-provider-config-table.js
20230206181106-remove-auth-with-iam-athena-resources.js
20230207021812-unset-auth-with-iam-lambda-dynamodb.js
20230207213126-change-user-id-on-workflow-releases-to-nullable.js
20230210003955-migrate-rejectUnauthorized.js
20230214003955-add-workflowSaveId-to-workflow-run.js
20230214190215-notifications-create.js
20230214205729-users-updates-to-support-external.js
20230216013625-create-role-pages-table.js
20230216162925-create-custom-domains.js
20230217000000-add-retooldb-provision-queue.js
20230222022554-create-source-control-relationship-table.js
20230224000808-create-role-pages-members-table.js
20230224155502-backfill-github-scm-config.js
20230228000814-backfill-resource-usage-in-apps.js
20230301173322-add-indices-to-source-control-relationships-table.js
20230302003843-drop-pageid-constraint-on-branches.js
20230303011815-custom-domains-organization-on-delete.js
20230304001139-add-timestamps-to-source-control-relationships-table.js
20230304001140-backfill-source-control-relationship-table-for-pages.js
20230306212001-update-users-externalIdentifier-constraint.js
20230307135628-add-ssl-to-grid-managed-cluster.js
20230307202255-create-secrets-manager-config-table.js
20230307234746-create-source-control-user-info-table.js
20230309000000-relax-retooldb-provision-resource-id-constraint.js
20230309194747-drop-branch-pagesave-constraints-from-commits.js
20230309231049-add-gitsha-column-to-commits.js
20230310004142-backfill-source-control-protection-status-with-element-columns.js
20230310164248-add-experiment-min-version.js
20230310231331-set-playground-body-type-get-queries.js
20230313214745-add-folderId-index-to-pages-table.js
20230313234031-add-folderId-index-to-workflow-table.js
20230313234047-add-releasedTagId-index-to-pages-table.js
20230314004206-backfill-gitsha-column-on-commits-table.js
20230314005055-add-releaseId-index-to-workflow-table.js
20230315000000-add-user-connection-strings-to-retooldb-provision.js
20230316002549-add-usage-analytics-access-column-to-group.js
20230316214302-update-users-email-constraint.js
20230317171651-organization-add-billing-type.js
20230317194213-add-index-workflowId-group_workflows.js
20230317200725-add-index-workflowId-workflow_aggregate_usage.js
20230317200750-add-index-workflowId-workflow_block_runs.js
20230317200758-add-index-workflowId-workflow_release.js
20230317200803-add-index-workflowId-workflow_run_logs.js
20230317222229-add-unique-constraint-source-control-user-info.js
20230320151228-add-workflow-deletedAt.js
20230320212445-patch-new-element-columns-in-source-control-protection-status.js
20230322183922-add-index-workflow-release-workflowSaveId.js
20230322183933-add-index-workflow-run-workflowSaveId.js
20230322185546-change-workflow-workflowReleaseId-delete-set-null.js
20230323143024-add-index-workflow-releaseId.js
20230329194140-add-region-and-desc-column.js
20230404235343-add-annual-billing-fields.js
20230407235343-make-name-on-group-non-nullable.js
20230408235343-add-index-for-completedAt-on-workflow-run.js
20230410214114-create-new-index-for-branchid-on-source-control-relationship-table.js
20230412000000-add-provider-to-retooldb-provision.js
20230412203100-add_source_control_settings.js
20230417172313-create-config-var-table.js
20230418223928-add-account-details-acccess-to-groups.js
20230419173351-backfill-account-details-access-on-groups-table.js
20230419212028-add-githubid-to-users-table.js
20230419221331-make-account-details-access-on-groups-non-nullable.js
20230420173710-backfill-org-id-column-to-source-control-protection-status.js
20230420185837-create-workflow-usage-tracked-properties.js
20230420210502-backfill-org-id-column-to-source-control-relationships.js
20230420222247-backfill-config-vars-and-values.js
20230421181622-create-aws-import-iam-credentials-table.js
20230424212337-backfill-org-id-column-to-source-control-relationships-2.js
20230424213446-backfill-org-id-column-to-source-control-protection-status-2.js
20230425195634-update_source_control_settings_column.js
20230426015920-add-non-null-constraint-to-workflow-tpu-workflow-id.js
20230430183900-add-index-workflow-run-not-complete.js
20230501164425-add-last-synced-commit-column-to-branch.js
20230502183807-add-index-group-id-on-user-groups.js
20230502183807-backfill-resource-usage-in-workflows.js
20230506000104-create-access-control-list.js
20230509200058-create-blueprints-table.js
20230511035052-notifications-application-create.js
20230512203346-add-favicon-and-org-name-cols-to-themes-table.js
20230512210848-backfill-hide-retool-references-col-on-themes-table.js
20230512224657-add-system-column-resources.js
20230517132518-add-retention-period-to-organization-and-workflow-run.js
20230519155155-add-custom-sso-settings-to-organization.js
20230524002705-custom-domains-add-pending-deletion.js
20230526185432-change-nullable-columns-in-scps.js
20230530235800-add-accent-color-col-to-themes-table.js
20230531185432-add-resource-uuid-column-in-playground-query-save.js
20230531215955-query-playground-uuid-index.js
20230531220514-ql-backfill-resource-uuid.js
20230531235800-add-trigger-to-workflow-run.js
20230601234149-add-local-permissions-org-column.js
20230606050732-create-vector-metadata-table.js
20230606231044-add-ai-support-org-column.js
20230607130440-add-iscleanedup-to-workflow-run.js
20230607201154-add-theme-configs-col-to-themes-table.js
20230609213431-add-resource-name-to-group-resources.js
20230612234411-create-new-query-library-constraint.js
20230614173832-create-workflow-trigger.js
20230615163347-backfill-workflow-trigger-table.js
20230615175515-add-orgId-column-to-source-control-deployments.js
20230615202013-backfill-orgId-column-on-source-control-deployments.js
20230615234411-create-workflow-temporal-cloud-configs.js
20230616075753-add-own-to-resource-access-constraints.js
20230623225555-backfill-access-control-lists-from-roles.js
20230624225555-backfill-acl-members-from-role-members.js
20230626222919-create-retool-files-table.js
20230627203447-create-language-configuration.js
20230628172322-workflow-run-triggerid-index.js
20230629172322-update-index-temporal-cloud-tls-config.js
20230629183500-backfill-access-control-lists-from-group-pages.js
20230706123456-create-source-control-repo-migration-table.js
20230706183404-create-source-control-repo-migration-logs-table.js
20230706184043-remove-non-production-group-resources.js
20230710222403-retool_files_index_update.js
20230713152954-create-default-outbound-region-column-in-organizations.js
20230714223220-add-organization-trial-fields.js
20230714224602-backfill-group-resources-resource-name.js
20230718232328-create-event-workflow-table.js
20230720201756-workflows-global-configuration.js
20230721222507-blueprint-remove-categories-column.js
20230721222520-add-appstore-tag-table.js
20230721222534-add-blueprint-appstore-tag-table.js
20230724181036-rename-group-resources-access-level-write-to-own.js
20230724181148-rename-group-resource-folder-defaults-access-level-write-to-own.js
20230724181310-rename-groups-universal-resource-access-write-to-own.js
20230724230102-add-request-access-setting-to-organizations.js
20230724233746-add-appstore-faq.js
20230728171738-workflow-runs-backfill-completedAt.js
20230728213801-add-column-page-is-form-app.js
20230801193119-workflow-run-add-environment-column.js
20230801204058-add-parent-org-id-to-organizations.js
20230802150313-workflow-runs-blob-cleanup-index.js
20230804052400-add-resource-name-index-to-group-resources.js
20230808010251-add-resourceId-to-retool-files.js
20230808075433-add-form-metadata-table.js
20230808183606-add-resource-name-index-to-resources.js
20230808194249-add-user-id-index-to-user-groups.js
20230808204915-add-form-fields-table.js
20230810181934-add-calling-retool-event-col-to-workflow-run.js
20230814182216-create-source-control-global-uuid-mapping-table.js
20230815001915-add-uuid-column.js
20230815010252-update-resourceId-constraint-retool-files.js
20230815232354-create-rules-table.js
20230817074612-add-appstore-path.js
20230818061517-remove-extra-acl-entries-for-role-pages.js
20230822182008-add-resource-id-v2-col-to-group-resources.js
20230822184533-add-resource-id-v2-index-on-group-resources.js
20230823001452-add-indices-for-acl-and-acl-members.js
20230828175613-backfill-source-control-uuid-mappings-table-for-pages.js
20230828175635-backfill-source-control-uuid-mappings-table-for-reosurces.js
20230828175646-backfill-source-control-uuid-mappings-table-for-playground-queries.js
20230828175654-backfill-source-control-uuid-mappings-table-for-workflows.js
20230829224425-rename-group-resource-access-levels-read-to-write.js
20230829224621-rename-group-resource-folder-defaults-access-levels-read-to-write.js
20230829224645-rename-groups-universal-resource-access-read-to-write.js
20230830175152-add-enabled-column-to-event-workflows.js
20230830175653-backfill-enabled-column-on-event-workflows-table.js
20230830175909-make-enabled-column-on-event-workflows-non-nullable.js
20230901215537-update-resources-displayname-unique-constraint-with-folder.js
20230901220301-add-isreferral-organization.js
20230905174717-remove-organization-name-unique-constraint.js
20230905184607-remove-unique-constraint-user-google-id.js
20230906180422-backfill-source-control-orgid-for-pages-3.js
20230906182027-backfill-source-control-orgid-for-playground-queries-in-scr.js
20230906211748-add-image-url-col-to-themes-table.js
20230908170713-add-billable-runs-count-to-workflow-aggregate-usage.js
20230912005153-add-custom-components-collections.js
20230914002105-add-column-page-shortlink.js
20230915225305-create-user-attributes-table.js
20230918025506-add-column-source-control-settings-for-version-control-locked.js
20230918201846-backfill-acls-from-group-pages-after-drift.js
20230918222937-add-user-id-index-on-sessions-table.js
20230922205207-add-mime-type-to-retool-file.js
20230925213407-create-unique-constraint-for-uuid-col-in-embeds-table.js
20230928171918-add-language-configuration-save.js
20230928192939-add-wf-save-index-language-configuration-save-js.js
20230928192949-add-wf-save-index-language-configuration-save-python.js
20230929123456-create-vscode-session-table.js
20231002123456-create-vscode-types-table.js
20231005171855-create-unique-partial-index-for-workflow-releases.js
20231005172101-backfill-workflow-release-names.js
20231005212016-add-intercom-app-id-column-to-themes-table.js
20231009175501-add-read-permissions-to-group-resources-for-none.js
20231009222814-add-intercom-identity-verification-key-column-to-themes-table.js
20231010004304-add-folder-id-to-retool-file.js
20231010191344-add-enabled-organization.js
20231010234801-backfill-root-folders-for-retool-storage.js
20231016225716-create-user-login-ips-table.js
20231024123456-add-more-indices-to-protection-status.js
20231025185402-add-intercom-attribute-name-column-to-org-user-attributes-table.js
20231026202744-create-new-index-for-orgid-on-app-themes-table.js
20231026234606-rerun-upgrade-read-to-none-group-resources.js
20231030185521-add_index_workflowrun_status.js
20231030213749-add-shared-column-in-branch.js
20231030221859-backfill-shared-on-branches.js
20231030234905-make-shared-on-branches-non-nullable-after-backfill.js
20231101174644-undo-migration-from-none-to-read.js
20231101232534-backfill-use-universal-resource-permissions.js
20231102010430-backfill-root-folders-for-retool-storage-again.js
20231102034756-backfill-use-group-resource-permissions.js
20231106184851-add-type-to-form.js
20231109213254-add-index-to-folderId-to-retool-files.js
20231114200155-add-metadata-column-to-user-invites-table.js
20231116190221-add-users-not-in-all-users-to-all-users.js
20231116231540-update-retooldb-resourcetype-backfill.js
20231120215225-organization-security-contact.js
\.


--
-- Data for Name: access_control_list_members; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.access_control_list_members (id, "aclId", "memberType", "memberId", "reasonMetadata", "addedByUser", "updatedAt", "createdAt") FROM stdin;
fdc961f4-c3bf-4a74-8bf0-588caea09a0f	f83fa1e0-55bb-4732-aa75-3eb3467416f1	acl	9caf0d09-a2aa-43dc-8a78-8ba45740df1f	\N	\N	2024-01-31 14:11:32.736+00	2024-01-31 14:11:32.736+00
7b811464-f149-4a7b-93ee-577465b089f4	9caf0d09-a2aa-43dc-8a78-8ba45740df1f	acl	9e7e9f1b-5102-4409-867a-a1f4d86c9d1d	\N	\N	2024-01-31 14:11:32.736+00	2024-01-31 14:11:32.736+00
\.


--
-- Data for Name: access_control_lists; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.access_control_lists (id, "entityType", "entityId", "accessLevel", "organizationId", "updatedAt", "createdAt") FROM stdin;
9e7e9f1b-5102-4409-867a-a1f4d86c9d1d	page	1	own	1	2024-01-31 14:11:32.722+00	2024-01-31 14:11:32.722+00
9caf0d09-a2aa-43dc-8a78-8ba45740df1f	page	1	write	1	2024-01-31 14:11:32.725+00	2024-01-31 14:11:32.725+00
f83fa1e0-55bb-4732-aa75-3eb3467416f1	page	1	read	1	2024-01-31 14:11:32.73+00	2024-01-31 14:11:32.73+00
\.


--
-- Data for Name: api_keys; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.api_keys (uuid, key, "organizationId", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: app_metadata; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.app_metadata (id, "pageId", "pageSaveId", "appVersion", height, width, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: app_themes; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.app_themes (id, name, "createdAt", "updatedAt", theme, organization_id, type) FROM stdin;
\.


--
-- Data for Name: approval_task_executions; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.approval_task_executions (uuid, "approvalTaskUuid", status, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: approval_task_items; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.approval_task_items (uuid, key, namespace, "createdAt", "updatedAt", data, metadata, "createdBy", "organizationId", "resourceName", finalized) FROM stdin;
\.


--
-- Data for Name: approval_task_votes; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.approval_task_votes (uuid, "approvalTaskUuid", choice, data, "createdAt", "updatedAt", "userId") FROM stdin;
\.


--
-- Data for Name: appstore_tags; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.appstore_tags (uuid, name, description, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: audit_trail_events; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.audit_trail_events (id, "userId", "organizationId", "userAgent", "ipAddress", "geoLocation", "responseTimeMs", "actionType", "pageName", "queryName", "resourceName", "createdAt", "updatedAt", metadata) FROM stdin;
1	1	1	\N	::ffff:192.168.127.1	\N	5167	SIGN_UP	\N	\N	\N	2024-01-31 14:11:37.34+00	2024-01-31 14:11:37.34+00	{"method": "password"}
2	1	1	\N	::ffff:192.168.127.1	\N	33	USER_NAME_CHANGE	\N	\N	\N	2024-01-31 14:11:43.098+00	2024-01-31 14:11:43.098+00	{"user": {"id": 1, "sid": "user_01d5aca86c2f4198aa062a73745dbadd", "email": "send@pagopa.it", "enabled": true, "lastName": "", "metadata": {}, "userName": null, "userType": "default", "createdAt": "2024-01-31T14:11:33.935Z", "firstName": "SEND", "updatedAt": "2024-01-31T14:11:43.005Z", "lastActive": "2024-01-31T14:11:37.299Z", "hasGoogleId": false, "lastLoggedIn": "2024-01-31T14:11:37.370Z", "organization": {"id": 1, "sid": "org_9bf3eaa5ca1a4d0a93ae5699a779527c", "name": "send@pagopa.it", "domain": null, "gitUrl": null, "planId": null, "enabled": true, "themeId": null, "hostname": null, "createdAt": "2024-01-31T14:11:32.538Z", "gitBranch": null, "subdomain": null, "updatedAt": "2024-01-31T14:11:32.538Z", "isReferral": false, "jitEnabled": null, "billingType": null, "companyName": null, "parentOrgId": null, "trialPlanId": null, "preloadedCSS": null, "contactNumber": null, "customSSOType": null, "inCanaryGroup": null, "idpMetadataXML": null, "javaScriptLinks": [], "trialExpiryDate": null, "billingCardBrand": null, "isCompanyAccount": null, "retoolDBRowLimit": null, "stripeCustomerId": null, "customSSOSettings": null, "defaultAppThemeId": null, "onpremStripePlanId": null, "protectedGitBranch": null, "protectedGitCommit": null, "protectedGitHubOrg": null, "billingCardLastFour": null, "cacheQueriesPerUser": null, "licenseVerification": null, "onboardingChecklist": null, "preloadedJavaScript": null, "protectedGitHubRepo": null, "aiSupportBotDisabled": false, "environmentVariables": {"customOAuth2SSOEnabled": false, "hideProdAndStagingToggles": false, "htmlEscapeRetoolExpressions": false, "enableCookieForwardingForResources": false, "enableCustomPlatformLevelAuthSteps": false, "enableClientSideCustomAuthBrowserCalls": false}, "requestAccessEnabled": null, "stripeSubscriptionId": null, "billingCardholderName": null, "defaultOutboundRegion": null, "twoFactorAuthRequired": null, "billingCardholderEmail": null, "platformLevelAuthSteps": null, "protectedGitHubBaseUrl": null, "stripeCurrentPeriodEnd": null, "trialAdditionalFeatures": null, "releaseManagementEnabled": true, "stripeCurrentPeriodStart": null, "annualSubscriptionDetails": null, "billingCardExpirationDate": null, "onboardingStagesCompleted": [], "retoolDBStorageLimitBytes": null, "onpremStripeSubscriptionId": null, "applyPreloadedCSSToHomepage": false, "protectedGitHubEnterpriseUrl": null, "workflowRunRetentionPeriodMins": null, "localPermissionsManagementEnabled": false, "sourceControlEmailAlertingEnabled": true, "retoolDBQueryRateLimitRequestsPerMinute": null}, "organizationId": 1, "profilePhotoUrl": null, "passwordExpiresAt": null, "salesCTADismissed": false, "externalIdentifier": null, "tutorialCTADismissed": false, "twoFactorAuthEnabled": null}}
3	1	1	\N	::ffff:192.168.127.1	\N	58	CREATE_RESOURCE	\N	\N	9645522e-358c-4e3f-9acf-70d570e012b1	2024-01-31 14:12:18.278+00	2024-01-31 14:12:18.278+00	{"source": "app", "resource": {"id": 2, "name": "9645522e-358c-4e3f-9acf-70d570e012b1", "type": "lambda", "synced": false, "protected": false, "editorType": "LambdaQuery", "production": {"id": 2, "ssl": null, "host": null, "name": "9645522e-358c-4e3f-9acf-70d570e012b1", "port": null, "type": "lambda", "uuid": "d9859e9b-cf7b-4402-97a8-aadf62e5bcd4", "options": {"assumeRole": "", "authWithIAM": true, "amazon_aws_region": "eu-south-1", "amazon_access_key_id": "", "amazon_secret_access_key": ""}, "authorId": 1, "createdAt": "2024-01-31T14:12:18.247Z", "protected": false, "updatedAt": "2024-01-31T14:12:18.247Z", "editorType": "LambdaQuery", "description": null, "displayName": "pn-lambda", "environment": "production", "databaseName": null, "whitelabeled": null, "editPrivilege": null, "environmentId": "2ae09db4-29b7-483e-94e5-bd22d6a8dbe6", "organizationId": 1, "outboundRegion": null, "databasePassword": null, "databaseUsername": null, "resourceFolderId": 1, "lastSyncedChecksum": null, "dynamicallyQueryable": false}, "description": null, "displayName": "pn-lambda", "environments": {"2ae09db4-29b7-483e-94e5-bd22d6a8dbe6": {"id": 2, "ssl": null, "host": null, "name": "9645522e-358c-4e3f-9acf-70d570e012b1", "port": null, "type": "lambda", "uuid": "d9859e9b-cf7b-4402-97a8-aadf62e5bcd4", "options": {"assumeRole": "", "authWithIAM": true, "amazon_aws_region": "eu-south-1", "amazon_access_key_id": "", "amazon_secret_access_key": ""}, "authorId": 1, "createdAt": "2024-01-31T14:12:18.247Z", "protected": false, "updatedAt": "2024-01-31T14:12:18.247Z", "editorType": "LambdaQuery", "description": null, "displayName": "pn-lambda", "environment": "production", "databaseName": null, "whitelabeled": null, "editPrivilege": null, "environmentId": "2ae09db4-29b7-483e-94e5-bd22d6a8dbe6", "organizationId": 1, "outboundRegion": null, "databasePassword": null, "databaseUsername": null, "resourceFolderId": 1, "lastSyncedChecksum": null, "dynamicallyQueryable": false}}, "whitelabeled": null, "outboundRegion": null, "resourceFolderId": 1}}
\.


--
-- Data for Name: bad_passwords; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.bad_passwords (id, password, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: block_saves; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.block_saves (id, "blockId", data, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: blocks; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.blocks (id, name, "organizationId", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: blueprints; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.blueprints (uuid, "pageId", "authorId", "organizationId", "displayName", description, stars, installs, thumbnail, "appState", resources, "dataSnapshot", "createdAt", "updatedAt", faqs, "urlPath") FROM stdin;
\.


--
-- Data for Name: blueprints_appstore_tags; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.blueprints_appstore_tags ("blueprintId", "tagId", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: branches; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.branches (id, name, "organizationId", "pageId", "pageSaveId", "ownerId", "createdAt", "updatedAt", "deletedAt", "baseCommit", "lastSyncedCommit", shared) FROM stdin;
\.


--
-- Data for Name: commits; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.commits (id, subject, body, "pageSaveId", "branchId", "authorId", "createdAt", "updatedAt", "gitSha") FROM stdin;
\.


--
-- Data for Name: component_metadata; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.component_metadata (id, "appMetadataId", "componentId", "componentType", height, width, "containerId", "componentProperties", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: config_var_values; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.config_var_values (uuid, "configVarUuid", "environmentId", value, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: config_vars; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.config_vars (uuid, "organizationId", name, description, secret, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: custom_component_collection_revision_files; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.custom_component_collection_revision_files (id, "customComponentCollectionRevisionId", filepath, "fileValue", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: custom_component_collection_revisions; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.custom_component_collection_revisions (id, uuid, version, "customComponentCollectionId", "publishedAt", "userId", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: custom_component_collections; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.custom_component_collections (id, name, label, description, uuid, "organizationId", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: custom_domains; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.custom_domains (id, "organizationId", domain, "isVerified", "verificationError", "createdAt", "updatedAt", "pendingDeletion") FROM stdin;
\.


--
-- Data for Name: dg_activity; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.dg_activity (id, "gridId", "actorUserId", "activityType", "bulkEditId", "singleEditId", "createdAt", "updatedAt", "table", "recordId", "onlyShowOnRecord") FROM stdin;
\.


--
-- Data for Name: dg_bulk_edit; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.dg_bulk_edit (id, "gridId", "createdByUserId", "executedAt", "executedByUserId", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: dg_grid; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.dg_grid (id, "resourceId", "organizationId", name, "createdAt", "updatedAt", "allowSchemaEdit", namespace, onboarded) FROM stdin;
\.


--
-- Data for Name: dg_single_edit; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.dg_single_edit (id, "gridId", "table", "editType", "bulkEditId", "rowId", "addedRowFields", "addedRowData", field, "oldValue", "newValue", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: embeds; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.embeds (id, uuid, "createdAt", "updatedAt", "pageId", password) FROM stdin;
\.


--
-- Data for Name: environment_config_vars; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.environment_config_vars (id, "environmentId", key, value, description, encrypted, public, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: environments; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.environments (id, "organizationId", name, description, "displayColor", "authorId", "createdAt", "updatedAt", "isDefault") FROM stdin;
2ae09db4-29b7-483e-94e5-bd22d6a8dbe6	1	production	An environment to define the production configuration of your resources	#3C92DC	\N	2024-01-31 14:11:32.598+00	2024-01-31 14:11:32.598+00	t
b4eb2d4c-d5a7-4642-a690-64a7d672b68e	1	staging	An environment to define the staging configuration of your resources	#E9AB11	\N	2024-01-31 14:11:32.599+00	2024-01-31 14:11:32.599+00	f
\.


--
-- Data for Name: event_workflows; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.event_workflows (id, "organizationId", "workflowId", "eventType", "createdAt", "updatedAt", enabled) FROM stdin;
\.


--
-- Data for Name: experiment_audiences; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.experiment_audiences (id, "organizationId", "experimentId", "userId", value, "createdAt", "updatedAt", "deletedAt") FROM stdin;
\.


--
-- Data for Name: experiment_strategies; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.experiment_strategies (id, strategy, "experimentId", "enrollmentCriteria", value, "targetId", "createdAt", "updatedAt") FROM stdin;
1	organization	1	\N	true	1	2024-01-31 14:11:34.028+00	2024-01-31 14:11:34.028+00
2	organization	2	\N	true	1	2024-01-31 14:11:34.044+00	2024-01-31 14:11:34.044+00
\.


--
-- Data for Name: experiments; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.experiments (id, name, "createdAt", "updatedAt", "deletedAt", "minVersion") FROM stdin;
1	retoolDBSchemaMigration	2024-01-31 14:11:34.017+00	2024-01-31 14:11:34.017+00	\N	\N
2	retoolDB	2024-01-31 14:11:34.036+00	2024-01-31 14:11:34.036+00	\N	\N
\.


--
-- Data for Name: external_embed_sessions; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.external_embed_sessions (id, "personalAccessTokenId", "organizationId", "externalUserId", "pageUuid", "groupIds", metadata, nonce, token, "expiresAt", "createdAt", "updatedAt", status, "userId") FROM stdin;
\.


--
-- Data for Name: external_users; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.external_users (id, "organizationId", "externalIdentifier", "firstName", "lastName", email, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: features; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.features (id, name, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: flow_input_schemas; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.flow_input_schemas (id, "flowId", type, name, "createdAt", "updatedAt", required, "uniqueForOpenTasks") FROM stdin;
\.


--
-- Data for Name: flow_queries; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.flow_queries (id, "playgroundQuerySaveId", "flowStageId", model, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: flow_stages; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.flow_stages (id, "flowId", name, "isFinalStage", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: flow_task_histories; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.flow_task_histories (id, "flowId", "flowStageId", "taskId", inputs, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: flow_task_inputs; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.flow_task_inputs (id, "taskId", "flowInputSchemaId", value, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: flow_tasks; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.flow_tasks (id, "flowStageId", "flowId", "ownerId", "createdAt", "updatedAt", "deletedAt") FROM stdin;
\.


--
-- Data for Name: flows; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.flows (id, name, "organizationId", "ownerId", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: folder_favorites; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.folder_favorites (id, "folderId", "userId", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: folders; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.folders (id, name, "organizationId", "systemFolder", "parentFolderId", "createdAt", "updatedAt", "folderType") FROM stdin;
1	root	1	t	\N	2024-01-31 14:11:32.561+00	2024-01-31 14:11:32.561+00	app
2	archive	1	t	1	2024-01-31 14:11:32.57+00	2024-01-31 14:11:32.57+00	app
3	root	1	t	\N	2024-01-31 14:11:32.581+00	2024-01-31 14:11:32.581+00	workflow
4	archive	1	t	3	2024-01-31 14:11:32.587+00	2024-01-31 14:11:32.587+00	workflow
5	root	1	t	\N	2024-01-31 14:11:32.593+00	2024-01-31 14:11:32.593+00	file
\.


--
-- Data for Name: form_fields; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.form_fields (id, "formId", name, type, active, "createdAt", "updatedAt", uuid) FROM stdin;
\.


--
-- Data for Name: forms; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.forms (id, "organizationId", "pageId", "resourceName", "tableName", "createdAt", "updatedAt", type) FROM stdin;
\.


--
-- Data for Name: grid_field; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.grid_field (id, "fieldName", "enumOptions", "gridId", "table", "createdAt", "updatedAt", "displayTimezone") FROM stdin;
\.


--
-- Data for Name: grid_group_access; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.grid_group_access (id, "gridId", "groupId", "accessLevel", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: grid_managed_cluster_resources; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.grid_managed_cluster_resources (id, "resourceId", "gridManagedClusterId", "userId", "databaseName", "databaseUsername") FROM stdin;
\.


--
-- Data for Name: grid_managed_clusters; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.grid_managed_clusters (id, type, host, port, "databaseName", "databaseUsername", "databasePassword", "createdBy", enabled, "createdAt", "updatedAt", ssl) FROM stdin;
\.


--
-- Data for Name: grid_table_group_access; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.grid_table_group_access (id, "gridId", "table", "groupId", "accessLevel", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: grid_table_user_access; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.grid_table_user_access (id, "gridId", "userId", "table", "accessLevel", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: grid_user_access; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.grid_user_access (id, "gridId", "userId", "accessLevel", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: grid_view; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.grid_view (id, name, "table", filter, sort, fields, "pinnedFields", "gridId", "createdByUserId", shared, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: group_folder_defaults; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.group_folder_defaults (id, "accessLevel", "groupId", "folderId", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: group_pages; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.group_pages (id, "groupId", "pageId", "accessLevel", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: group_resource_folder_defaults; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.group_resource_folder_defaults ("accessLevel", "createdAt", "updatedAt", id, "groupId", "resourceFolderId") FROM stdin;
\.


--
-- Data for Name: group_resources; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.group_resources (id, "groupId", "resourceId", "accessLevel", "createdAt", "updatedAt", "resourceName", "resourceIdForEnv") FROM stdin;
1	4	\N	write	2024-01-31 14:11:44.203+00	2024-01-31 14:11:44.203+00	retool_ai	\N
\.


--
-- Data for Name: group_workflows; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.group_workflows (id, "groupId", "workflowId", "accessLevel", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: groups; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.groups (id, name, "organizationId", "createdAt", "updatedAt", "universalAccess", "universalResourceAccess", "universalQueryLibraryAccess", "userListAccess", "archivedAt", "auditLogAccess", "unpublishedReleaseAccess", "universalWorkflowAccess", "usageAnalyticsAccess", "accountDetailsAccess") FROM stdin;
1	admin	1	2024-01-31 14:11:32.67+00	2024-01-31 14:11:32.67+00	own	own	write	t	\N	t	t	own	t	t
2	editor	1	2024-01-31 14:11:32.67+00	2024-01-31 14:11:32.67+00	write	own	write	t	\N	f	t	write	f	t
3	viewer	1	2024-01-31 14:11:32.67+00	2024-01-31 14:11:32.67+00	read	read	read	t	\N	f	f	read	f	t
4	All Users	1	2024-01-31 14:11:32.67+00	2024-01-31 14:11:32.67+00	write	own	write	t	\N	f	f	write	f	t
\.


--
-- Data for Name: iam_credentials; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.iam_credentials (uuid, "organizationId", "awsAccessKeyId", "awsSecretAccessKey", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: instrumentation_integrations; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.instrumentation_integrations (id, integration, key, enabled, "createdAt", "updatedAt", organization_id, config) FROM stdin;
\.


--
-- Data for Name: language_configuration; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.language_configuration (id, "organizationId", name, language, libraries, "librariesFormat", "aliasFor", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: language_configuration_save; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.language_configuration_save (id, "languageConfigurationId", name, description, libraries, "librariesFormat", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: notification_applications; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.notification_applications (id, "organizationId", "bundleId", platform, "notifierApplicationId", "createdBy", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: notification_subscribed_devices; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.notification_subscribed_devices (id, "userId", "deviceId", "transportType", "transportData", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: notification_topic_subscriptions; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.notification_topic_subscriptions (id, "organizationId", "pageId", "userId", "topicName", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: org_image_blobs; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.org_image_blobs (id, name, "createdAt", "updatedAt", "deletedAt", type, blob, "organizationId") FROM stdin;
\.


--
-- Data for Name: organization_email_domains; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.organization_email_domains ("organizationId", "emailDomain", "allowAutoJoin", id) FROM stdin;
\.


--
-- Data for Name: organization_user_attributes; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.organization_user_attributes (id, "organizationId", name, label, "dataType", "defaultValue", "intercomAttributeName") FROM stdin;
\.


--
-- Data for Name: organizations; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.organizations (id, domain, name, hostname, "createdAt", "updatedAt", subdomain, "trialExpiryDate", "preloadedJavaScript", "javaScriptLinks", "gitUrl", "planId", "stripeCustomerId", "billingCardholderName", "billingCardLastFour", "billingCardExpirationDate", "stripeSubscriptionId", "billingCardBrand", "billingCardholderEmail", "preloadedCSS", sid, "isCompanyAccount", "companyName", "contactNumber", "gitBranch", "twoFactorAuthRequired", "applyPreloadedCSSToHomepage", "onboardingChecklist", "idpMetadataXML", "jitEnabled", "onboardingStagesCompleted", "themeId", "licenseVerification", "platformLevelAuthSteps", "defaultAppThemeId", "protectedGitHubOrg", "protectedGitHubRepo", "protectedGitBranch", "protectedGitCommit", "cacheQueriesPerUser", "protectedGitHubBaseUrl", "protectedGitHubEnterpriseUrl", "onpremStripeSubscriptionId", "onpremStripePlanId", "inCanaryGroup", "protectedAppsSyncEnabled", "releaseManagementEnabled", "stripeCurrentPeriodStart", "stripeCurrentPeriodEnd", "retoolDBStorageLimitBytes", "retoolDBRowLimit", "retoolDBQueryRateLimitRequestsPerMinute", "sourceControlEmailAlertingEnabled", "billingType", "annualSubscriptionDetails", "workflowRunRetentionPeriodMins", "customSSOType", "customSSOSettings", "localPermissionsManagementEnabled", "aiSupportBotDisabled", "defaultOutboundRegion", "trialPlanId", "trialAdditionalFeatures", "requestAccessEnabled", "parentOrgId", "isReferral", enabled, "securityContact") FROM stdin;
1	\N	send@pagopa.it	\N	2024-01-31 14:11:32.538+00	2024-01-31 14:12:18.26+00	\N	\N	\N	[]	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	org_9bf3eaa5ca1a4d0a93ae5699a779527c	\N	\N	\N	\N	\N	f	\N	\N	\N	["resource"]	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	t	\N	\N	\N	\N	\N	t	\N	\N	\N	\N	\N	f	f	\N	\N	\N	\N	\N	f	t	\N
\.


--
-- Data for Name: page_docs; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.page_docs (id, "pageId", "editorDocumentation", "userDocumentation", "openIfNotYetSeen", "createdAt", "updatedAt", "lastEditedBy") FROM stdin;
\.


--
-- Data for Name: page_favorites; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.page_favorites (id, "pageId", "userId", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: page_onboarding_state; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.page_onboarding_state (id, "pageId", data, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: page_save_playground_query_saves; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.page_save_playground_query_saves (id, "pageSaveId", "playgroundQuerySaveId", "createdAt", "updatedAt", "pageId", "playgroundQueryId", "pinnedToLatestVersion") FROM stdin;
\.


--
-- Data for Name: page_saves; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.page_saves (id, data, "createdAt", "updatedAt", "pageId", "changesRecord", "userId", "gitSha", "branchId", checksum) FROM stdin;
1	{"appState": "[\\"~#iR\\",[\\"^ \\",\\"n\\",\\"appTemplate\\",\\"v\\",[\\"^ \\",\\"isFetching\\",false,\\"plugins\\",[\\"~#iOM\\",[]],\\"createdAt\\",null,\\"version\\",\\"3.24.9\\",\\"appThemeId\\",null,\\"appThemeName\\",null,\\"appMaxWidth\\",\\"100%\\",\\"preloadedAppJavaScript\\",null,\\"preloadedAppJSLinks\\",[],\\"testEntities\\",[],\\"tests\\",[],\\"appStyles\\",\\"\\",\\"responsiveLayoutDisabled\\",false,\\"loadingIndicatorsDisabled\\",false,\\"urlFragmentDefinitions\\",[\\"~#iL\\",[]],\\"pageLoadValueOverrides\\",[\\"^A\\",[]],\\"customDocumentTitle\\",\\"\\",\\"customDocumentTitleEnabled\\",false,\\"customShortcuts\\",[],\\"isGlobalWidget\\",false,\\"isMobileApp\\",false,\\"isFormApp\\",false,\\"shortlink\\",null,\\"multiScreenMobileApp\\",false,\\"mobileAppSettings\\",[\\"^ \\",\\"mobileOfflineModeEnabled\\",false,\\"mobileOfflineModeDelaySync\\",false,\\"mobileOfflineModeBannerMode\\",\\"default\\",\\"displaySetting\\",[\\"^ \\",\\"landscapeMode\\",false,\\"tabletMode\\",false]],\\"folders\\",[\\"^A\\",[]],\\"queryStatusVisibility\\",false,\\"markdownLinkBehavior\\",\\"auto\\",\\"inAppRetoolPillAppearance\\",\\"NO_OVERRIDE\\",\\"rootScreen\\",null,\\"instrumentationEnabled\\",false,\\"experimentalFeatures\\",[\\"^ \\",\\"sourceControlTemplateDehydration\\",false,\\"multiplayerEditingEnabled\\",false,\\"disableMultiplayerEditing\\",false],\\"experimentalDataTabEnabled\\",false,\\"customComponentCollections\\",[],\\"savePlatform\\",\\"web\\"]]]"}	2024-01-31 14:11:32.743+00	2024-01-31 14:11:32.743+00	1	[{"type": "CREATE_APP"}]	\N	\N	\N	\N
2	{"appState": "[\\"~#iR\\",[\\"^ \\",\\"n\\",\\"appTemplate\\",\\"v\\",[\\"^ \\",\\"isFetching\\",false,\\"plugins\\",[\\"~#iOM\\",[]],\\"createdAt\\",null,\\"version\\",\\"3.24.9\\",\\"appThemeId\\",null,\\"appThemeName\\",null,\\"appMaxWidth\\",\\"100%\\",\\"preloadedAppJavaScript\\",null,\\"preloadedAppJSLinks\\",[],\\"testEntities\\",[],\\"tests\\",[],\\"appStyles\\",\\"\\",\\"responsiveLayoutDisabled\\",false,\\"loadingIndicatorsDisabled\\",false,\\"urlFragmentDefinitions\\",[\\"~#iL\\",[]],\\"pageLoadValueOverrides\\",[\\"^A\\",[]],\\"customDocumentTitle\\",\\"\\",\\"customDocumentTitleEnabled\\",false,\\"customShortcuts\\",[],\\"isGlobalWidget\\",false,\\"isMobileApp\\",false,\\"isFormApp\\",false,\\"shortlink\\",null,\\"multiScreenMobileApp\\",false,\\"mobileAppSettings\\",[\\"^ \\",\\"mobileOfflineModeEnabled\\",false,\\"mobileOfflineModeDelaySync\\",false,\\"mobileOfflineModeBannerMode\\",\\"default\\",\\"displaySetting\\",[\\"^ \\",\\"landscapeMode\\",false,\\"tabletMode\\",false]],\\"folders\\",[\\"^A\\",[]],\\"queryStatusVisibility\\",false,\\"markdownLinkBehavior\\",\\"auto\\",\\"inAppRetoolPillAppearance\\",\\"NO_OVERRIDE\\",\\"rootScreen\\",null,\\"instrumentationEnabled\\",false,\\"experimentalFeatures\\",[\\"^ \\",\\"sourceControlTemplateDehydration\\",false,\\"multiplayerEditingEnabled\\",false,\\"disableMultiplayerEditing\\",false],\\"experimentalDataTabEnabled\\",false,\\"customComponentCollections\\",[],\\"savePlatform\\",\\"web\\"]]]"}	2024-01-31 14:11:48.522+00	2024-01-31 14:11:48.522+00	1	[]	\N	\N	\N	\N
\.


--
-- Data for Name: page_user_heartbeats; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.page_user_heartbeats ("userId", "pageId", mode, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: pages; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.pages (id, name, "createdAt", "updatedAt", "organizationId", "folderId", uuid, "releasedTagId", "photoUrl", "deletedAt", "lastEditedBy", "isGlobalWidget", protected, synced, description, "clonedFromTemplateName", "isMobileApp", "tempReleasedTagId", "blueprintMetadata", "isFormApp", shortlink) FROM stdin;
1	Title your first app	2024-01-31 14:11:32.654+00	2024-01-31 14:11:53.326+00	1	2	a2ca464a-c042-11ee-8ca6-43f5f0ec5d6c	\N	\N	2024-01-31 14:11:53.326+00	\N	\N	f	f	\N	\N	\N	\N	\N	f	\N
\.


--
-- Data for Name: partially_registered_users; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.partially_registered_users (id, email, "firstName", "lastName", "hashedPassword", "registrationToken", "usedSso", "createdAt", "updatedAt", "verifiedAt") FROM stdin;
\.


--
-- Data for Name: personal_access_tokens; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.personal_access_tokens (id, label, description, "hashedKey", "organizationId", "userId", revoked, scope, "createdAt", "updatedAt", last4) FROM stdin;
\.


--
-- Data for Name: plan_features; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.plan_features (id, "planId", "featureId", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: plans; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.plans (id, name, "createdAt", "updatedAt", "stripePlanId", "minSeats", grandfathered) FROM stdin;
\.


--
-- Data for Name: playground_queries; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.playground_queries (id, name, description, shared, "ownerId", "createdAt", "updatedAt", "organizationId", uuid) FROM stdin;
1	Country Search		f	1	2024-01-31 14:11:33.985+00	2024-01-31 14:11:33.985+00	1	1ec10fe0-a8e2-4ce0-a10e-5677cddbc48b
\.


--
-- Data for Name: playground_query_saves; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.playground_query_saves (id, data, "resourceId", "adhocResourceType", "createdAt", "updatedAt", "editorId", "playgroundQueryId", uuid, "playgroundQueryUuid", "resourceUuid") FROM stdin;
1	{"body": "", "data": null, "type": "GET", "query": "https://restcountries.com/v3.1/name/{{ country_name }}", "cookies": "", "headers": "", "rawData": null, "bodyType": "none", "timestamp": 0, "isFetching": false, "isImported": false, "cacheKeyTtl": "", "transformer": "// type your code here\\n// example: return formatDataAsArray(data).filter(row => row.quantity > 20)\\nreturn data", "queryTimeout": "100000", "enableCaching": false, "privateParams": [], "queryDisabled": "", "watchedParams": [], "successMessage": "", "paginationLimit": "", "queryRefreshTime": "", "runWhenPageLoads": false, "enableTransformer": false, "paginationEnabled": false, "playgroundQueryId": 0, "queryThrottleTime": "750", "queryTriggerDelay": "0", "showSuccessToaster": true, "confirmationMessage": null, "importedQueryInputs": {"country_name": ""}, "paginationDataField": "", "playgroundQueryUuid": "", "requireConfirmation": false, "runWhenModelUpdates": true, "queryDisabledMessage": "", "resourceNameOverride": "", "importedQueryDefaults": {"country_name": "united"}, "playgroundQuerySaveId": 0, "runWhenPageLoadsDelay": "", "paginationPaginationField": ""}	\N	RESTQuery	2024-01-31 14:11:33.992+00	2024-01-31 14:11:33.992+00	1	1	ccecda64-9347-4b24-8336-4f417bde2352	1ec10fe0-a8e2-4ce0-a10e-5677cddbc48b	\N
\.


--
-- Data for Name: query_metadata; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.query_metadata (id, "appMetadataId", "queryId", "queryType", "queryProperties", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: recently_visited_apps; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.recently_visited_apps ("userId", "pageId", "visitType", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: resource_folders; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.resource_folders (name, "systemFolder", "createdAt", "updatedAt", id, "organizationId", "parentFolderId") FROM stdin;
root	t	2024-01-31 14:11:32.576+00	2024-01-31 14:11:32.576+00	1	1	\N
\.


--
-- Data for Name: resource_preview_hints; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.resource_preview_hints (id, "resourceType", "errorMessageMatcher", hint, active, "requestType", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: resources; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.resources (id, name, type, host, port, "databaseName", "databaseUsername", "databasePassword", "createdAt", "updatedAt", "organizationId", ssl, "editPrivilege", options, environment, "dynamicallyQueryable", "displayName", "environmentId", "resourceFolderId", protected, "authorId", "lastSyncedChecksum", uuid, description, "outboundRegion", whitelabeled) FROM stdin;
1	retool_ai	retoolAI	\N	\N	\N	\N	\N	2024-01-31 14:11:44.138+00	2024-01-31 14:11:44.138+00	1	\N	f	{}	production	f	retool_ai	2ae09db4-29b7-483e-94e5-bd22d6a8dbe6	1	f	\N	\N	54095084-44e8-4da7-b456-0a02323c17be	Retool AI Resource	\N	t
2	9645522e-358c-4e3f-9acf-70d570e012b1	lambda	\N	\N	\N	\N	\N	2024-01-31 14:12:18.247+00	2024-01-31 14:12:18.247+00	1	\N	\N	{"assumeRole": "", "authWithIAM": true, "amazon_aws_region": "eu-south-1", "amazon_access_key_id": "", "amazon_secret_access_key": ""}	production	f	pn-lambda	2ae09db4-29b7-483e-94e5-bd22d6a8dbe6	1	f	1	\N	d9859e9b-cf7b-4402-97a8-aadf62e5bcd4	\N	\N	\N
\.


--
-- Data for Name: retool_databases; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.retool_databases (id, "databaseName", "ownerUsername", "ownerPassword", "readonlyUsername", "readonlyPassword", "organizationId", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: retool_db_migrations; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.retool_db_migrations (id, "pgPid", "suggestedSqlScript", "sqlScript", "resourceName", "organizationId", "originEnvironmentId", "targetEnvironmentId", status, error, "createdById", "cancelledById", "finishedAt", "updatedAt", "createdAt") FROM stdin;
\.


--
-- Data for Name: retool_db_provision; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.retool_db_provision (id, status, "connectionString", "externalId", "resourceId", "organizationId", "updatedAt", "createdAt", "retoolUserConnectionString", "externalUserConnectionString", provider) FROM stdin;
\.


--
-- Data for Name: retool_files; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.retool_files (id, "organizationId", "fileId", name, "sizeBytes", "s3Key", "createdBy", "updatedBy", "createdAt", "updatedAt", "resourceId", "mimeType", "folderId") FROM stdin;
\.


--
-- Data for Name: retool_managed_note; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.retool_managed_note (id, "evaluatedKey", value, "organizationId", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: retool_managed_note_comment; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.retool_managed_note_comment (id, "retoolManagedNoteId", "userId", value, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: retool_rules; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.retool_rules (id, "organizationId", description, name, target, actions, rules, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: retool_table_events; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.retool_table_events (id, "retoolTableId", "eventType", "sqlCommand", "sqlParameters", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: retool_tables; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.retool_tables (id, "tableName", "retoolDatabaseId", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: role_pages; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.role_pages (id, "pageId", "organizationId", "accessType", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: role_pages_members; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.role_pages_members (id, "roleId", "organizationId", "userId", "userInviteId", "isAdmin", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: secrets_manager_configs; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.secrets_manager_configs (id, provider, "organizationId", config) FROM stdin;
\.


--
-- Data for Name: sessions; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.sessions (id, "userId", "accessToken", "expirationDate", "createdAt", "updatedAt", status, state) FROM stdin;
1	1	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ4c3JmVG9rZW4iOiI0NDgwNjBlMC1jYjMzLTRhNWItYTk3My01ZTFiZGJkMzk0OGIiLCJ2ZXJzaW9uIjoiMS4yIiwiaWF0IjoxNzA2NzEwMjk3fQ.z7_ocgtB_6HYJoHFseuydTXyEcdDm1BLdkK0z4UH_58	2024-02-07 14:11:37.381+00	2024-01-31 14:11:37.386+00	2024-01-31 14:11:37.386+00	\N	\N
\.


--
-- Data for Name: source_control_deployment_settings; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.source_control_deployment_settings (id, "nextDeployAt", "organizationId", "lastJobsRunnerHeartbeat", "isExponentiallyBackedOff") FROM stdin;
0f8c894f-d99e-4f1c-b636-3a62e6003483	\N	1	\N	f
\.


--
-- Data for Name: source_control_deployments; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.source_control_deployments (id, type, "commitSha", status, "createdAt", "completedAt", logs, "updatedAt", "triggeredBy", "organizationId") FROM stdin;
\.


--
-- Data for Name: source_control_protection_status; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.source_control_protection_status (id, "protectionBranchName", status, "protectionSha", "entityType", "entityUuid", "elementType", "elementUuid", "organizationId") FROM stdin;
\.


--
-- Data for Name: source_control_provider_configs; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.source_control_provider_configs (id, provider, "organizationId", config) FROM stdin;
\.


--
-- Data for Name: source_control_relationships; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.source_control_relationships (id, "elementUuid", "elementType", "elementSaveId", "branchId", "commitId", "createdAt", "updatedAt", "organizationId") FROM stdin;
\.


--
-- Data for Name: source_control_repo_migration_logs; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.source_control_repo_migration_logs (id, "organizationId", "migrationId", status, logs, "branchName", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: source_control_repo_migrations; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.source_control_repo_migrations (id, "organizationId", "fromVersion", "toVersion", status, "triggeredBy", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: source_control_settings; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.source_control_settings (id, "organizationId", "enableAutoBranchNaming", "enableCustomPullRequestTemplate", "customPullRequestTemplate", "versionControlLocked") FROM stdin;
\.


--
-- Data for Name: source_control_user_info; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.source_control_user_info (id, "organizationId", "userId", "createdAt", "updatedAt", head) FROM stdin;
\.


--
-- Data for Name: source_control_uuid_mappings; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.source_control_uuid_mappings (id, "globalUuid", "elementUuid", "elementType", "organizationId") FROM stdin;
\.


--
-- Data for Name: ssh_keys; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.ssh_keys (id, "organizationId", "privateKey", "publicKey", "createdAt", "updatedAt") FROM stdin;
1	1	-----BEGIN RSA PRIVATE KEY-----\nMIIJKQIBAAKCAgEAtsPQc8RnKLw7SYEN7OvmKW2iYt0D+dR+stFChKd5grR6mZSxEWL7uPIt\njL6XVGHLJ0YW8VGB0jCV6lUtqj0l+248Jowf9XTla6yx7WcgSsFQ5QOB9SjI3zTiSNRg8XIl\nrmOqod4uXw2A6T6gIjYk3rKcHQhmiQMpB7lK+CNL8Pk440bvvKQgCzuQWsx8RNFlX8h8d436\nLFxVSoaRO1tbYxM6ThxI5BBonL9RjQO243Usuj4Alakhh+9FJjOtPfv/9TAiIb5rho+aitIF\nuDHRxSRch+8Pe54y8KGyfSEZBxpJkWGJNTP04ZeRSaymEEWIPjEHopIFyX/f7cupWf4rI9HU\n++aia2Vkr0SkKgerXSc30AWXyLfffWmAiwlfCCgNH6I88KTSLyEvYiHLC+jZaAiq9EpClV3k\nGEGT4LR2kSJQw6wTyQqYlJShXA6f2SNkhZ6mPVdenFJlzfTuaTqWxzpcft+MnI1iorloESKZ\nzw6I9Ir0PLw1lZlc0GwFAM9xXjA434fXdReBMnlGXa7qz/br3arn75YfSGkhPFifh0RHSTr+\nbJjQNe2XupJrhCJoKOvPNI4EO86pOUHPnSPDKA8Jzx82Od83Zn00QHHilXrOg5vTvBq2Yctb\noFDpu1AZrLdR7rV8TVNit1ePt7czJvubjjOebovVq0Q7Ms57izkCAwEAAQKCAgAObe+2pCQA\nFSEzkKSlaiTpONNGrbjTPN6mUyhgSf5C8bYLcbAR9YtDZjaiBqe/k46ZhcqCUcAUWzekbgZf\nJKX4b6yaEoGxCTVvxqbjKm6XPr00FFtqgqzRSpIvBwccXCAmrSgn0Kw/Xu6PLupi3El7t56x\ns08WtCqSH72QHiFJxjNvZjm/qzZiDKYKAfXLU4jtNgP1rT6G/ODTAHeihKtdBOo07opZ6NDv\n+mVMfKWWcblCGJ3gZjkHS9gp+vYYXB2XB+GgYZgie8X+ZDSFZV5XC6Oukiym9hRP56qsf5qq\nDLF2o++6q2TcrSQp+YXAgezblCPMYKD9idxt7To5DuMftaEFgR+oRr0eoymxT1VRBFTSkDBZ\ndXhmEYcKHf8ovYroS4cqaO6XvwpeteyTvUfNhZV2Ck1t9izV1xEfCZMlZpzzAocKyntOtFA+\njwOJLV08j+RCvUGz4zCv7VjTYNrStwNJoOsvWp2FrXrBqx0sgS/HaINFerqC0Ho2Nq4uehfw\n8FQPf0QIIMcBmscpi5ioxH80YmPLURMJkKoCbDdu2Wk2KN6fOpC8fYOq8ADNzFt/w++v0JLG\nO55NSGE0UsmqYHQndED9dslj21vPkrmxYabgFKCjPZSjF1BoSPz9GSd1SYTZQcTA72HyKKzf\nc7x0FGOzoPXPpIuHt9Rvaa4sXQKCAQEA/zkRF9Idmv7dygozpuvPBGI4bG2IppYtmEyt0qCo\nOggGxUTfu1mjIm+VXGIF3nDHmsHyDaEbqzTyClLtiHwGLW5YKw3gtNrr2Xhik9DG++LgjX+z\nWutzNtFa80SWXqoQVkD1wlDsuVSJZ4AY9ct/fWiLVPW+X1dPmqY1Rs8S55o7LEQ5/PqkDkTB\n1QG7xbaWREF42MDY6excc9Zpl8etRgzGt7FrhpZmksmGeDjo2lTbKIrHBT7oULc/R/IMdFQz\ngJAsjCtzHej3mdVje+e/WEAfV56h4kKYcV6wWcSqDyiXY3vLtUM8yjUe0u3cMc1OKCuoQMPv\nne9dotRtOjBEnwKCAQEAt1JFKgKcf2RVzdLs/vZMVxbWNwIsEXi2ix58+InQdBkiFXK1+s6m\nxR+ZJJkkHAZtFWNcwCAScNnqcYdb/Md2+F67miyaHeMfitWN05CIi8jBdcOqBWmxjwJcIIJa\n70ABFXcGaFPY8W4oSpeDhDVjgf4dQqVtRg9n+dBZVl7ZKVYNOQEN1QVls6zUxcFYmV5wt7kz\n9+TsdMSbhknjiMsxN6/wLYyqVH78I1rF2xk8LiKYgn2LsSdjQ+6+4KhxP5uVqkOw0rnJr2xI\n88sXQcYwPm2m0RmcLIZRGNKsv0hPW+2guRZ8mfwTNfH1wo4evTOq2bi04otN0kN2wdIS4piJ\nJwKCAQEAgDqMwvoXU8tfZWYww1nQnfQ3QwrZUFE9wTotTxjWzKlBtZVAD2Ie22tSkKLTLgpd\nzvxIf96FB0THorY9j4g4llTNSXxkfJlNS+r3JCsN/nnjtlQFqdWIAm+3EWhRYGhzYtKqZyG/\nffHiQzUR1VSTzk9bSalaJ463eQyu0c+yQNi1iC0TMW5ARMb41+tSCykMYGjAra5ejVDqtmxw\niwiQnxRGNv6V9n3UNUW5IOf+3csqfTkUeyc7E2quCZir9zpi0eId76LY6Jsm44xZumQaN92n\noZ8a2JH7A2K+mat8gbc0MJB/LagFf9amkPVe30q2TOp6U2feGOytj+TIqCaeIwKCAQEAkumq\npg0rr+gP33//ECEAcvbJO5JRELtlxz3qtx9y3+fYacnhTxtXiThWeX8E8jSwLOjRRuMtBCWP\nfeYVcRHFJSx+OgMui28eMxwLqhX1Z9i+OYtR8T6P3mTswdzV1VC8zZ/ykZ9Ih8tZHNYpvsUu\ndtnYRzXdybzE/e3b+pzOehMNS7atiB7oL0L9zXGyeE64FHSm0i4y1S1O2iLS5yi3y8ICv+4v\n/sE5fXfcgkbJ9Msi38iPL6y6H5HwhIhZIbmlCqtuxKHBoQUtvbrva3XR6eXkP0S/5OrLiRIl\nALKJbsmT+WCtAJaEKsI6yu0sc0I51Hvy8m7jMfOA87lQCyplFwKCAQAxzKEJ6zVrrpkVKUMm\nARu0kqV1TG3ZlwsDTrcYN8Do97elCsNfzUn7kVeed6T5ylu+dpCLz6LsZirc86sW6r2oHeZA\nVAqmZsxbDvtF36JCKNcFQrw0qSSyvqfDu7WJxDEDmnPfFzhz23hBKltXctGtFCp6JANXJMc6\n6JkmmkuA2v5cuwy+pzhu4n/8pqB+vFq3fcAdyVBCFMsMofVl6bYBi+48N3HYLtOjmMNXTnx4\nZ1OC+LcmnbSfX/1r751nXrlYLvEU8f0nApIbv+oSN43i8pQK6eJAVoU0Kdj3//UhO9yXwh3x\nhnYCJ1ZPTyu0V5idITgPVvrE9UYQXH/lQ9uj\n-----END RSA PRIVATE KEY-----\n\n	-----BEGIN RSA PUBLIC KEY-----\nMIICCgKCAgEAtsPQc8RnKLw7SYEN7OvmKW2iYt0D+dR+stFChKd5grR6mZSxEWL7uPItjL6X\nVGHLJ0YW8VGB0jCV6lUtqj0l+248Jowf9XTla6yx7WcgSsFQ5QOB9SjI3zTiSNRg8XIlrmOq\nod4uXw2A6T6gIjYk3rKcHQhmiQMpB7lK+CNL8Pk440bvvKQgCzuQWsx8RNFlX8h8d436LFxV\nSoaRO1tbYxM6ThxI5BBonL9RjQO243Usuj4Alakhh+9FJjOtPfv/9TAiIb5rho+aitIFuDHR\nxSRch+8Pe54y8KGyfSEZBxpJkWGJNTP04ZeRSaymEEWIPjEHopIFyX/f7cupWf4rI9HU++ai\na2Vkr0SkKgerXSc30AWXyLfffWmAiwlfCCgNH6I88KTSLyEvYiHLC+jZaAiq9EpClV3kGEGT\n4LR2kSJQw6wTyQqYlJShXA6f2SNkhZ6mPVdenFJlzfTuaTqWxzpcft+MnI1iorloESKZzw6I\n9Ir0PLw1lZlc0GwFAM9xXjA434fXdReBMnlGXa7qz/br3arn75YfSGkhPFifh0RHSTr+bJjQ\nNe2XupJrhCJoKOvPNI4EO86pOUHPnSPDKA8Jzx82Od83Zn00QHHilXrOg5vTvBq2YctboFDp\nu1AZrLdR7rV8TVNit1ePt7czJvubjjOebovVq0Q7Ms57izkCAwEAAQ==\n-----END RSA PUBLIC KEY-----\n\n	2024-01-31 14:11:32.675+00	2024-01-31 14:11:32.675+00
\.


--
-- Data for Name: startup_programs; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.startup_programs ("organizationId", "inStartupProgram", "isVoucherRedeemed", "enrolledAt", "updatedAt", "discountAmountUsd") FROM stdin;
\.


--
-- Data for Name: storage_blobs; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.storage_blobs (id, name, "createdAt", "updatedAt", "deletedAt", "organizationId", "creatorId", mimetype, size, metadata) FROM stdin;
\.


--
-- Data for Name: tags; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.tags (id, name, "pageId", "pageSaveId", "createdAt", "updatedAt", description, "creatorUserId", "releaserUserId") FROM stdin;
\.


--
-- Data for Name: temporal_cloud_settings; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.temporal_cloud_settings (id, "organizationId", enabled, region, namespace, "temporalCloudTlsConfigId", "updatedAt", "createdAt") FROM stdin;
\.


--
-- Data for Name: temporal_cloud_tls_configs; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.temporal_cloud_tls_configs (id, "organizationId", namespace, "tlsCrt", "tlsKey", "tlsCrtExpiresAt", "tlsCA", "tlsCAExpiresAt", "updatedAt", "createdAt") FROM stdin;
\.


--
-- Data for Name: themes; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.themes (id, "logoFileName", "headerBackgroundColor", "logoFile", "createdAt", "updatedAt", "hideRetoolPill", "headerModulePageId", "headerApplyType", "showHeaderLogo", "showLoginLogo", "retoolPillAppearance", "faviconFileName", "faviconFile", "orgDisplayName", "hideRetoolReferences", "accentColor", "themeConfigs", "logoFileUrl", "faviconFileUrl", "intercomAppId", "intercomIdentityVerificationKey") FROM stdin;
\.


--
-- Data for Name: tracked_property_usages; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.tracked_property_usages (id, "propertyIdentifier", "propertyType", "pageId", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: user_groups; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.user_groups (id, "userId", "groupId", "createdAt", "updatedAt", "isAdmin") FROM stdin;
1	1	4	2024-01-31 14:11:33.955+00	2024-01-31 14:11:33.955+00	f
2	1	1	2024-01-31 14:11:34.008+00	2024-01-31 14:11:34.008+00	f
\.


--
-- Data for Name: user_invite_groups; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.user_invite_groups (id, "userInviteId", "groupId", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: user_invite_suggestions; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.user_invite_suggestions (id, "suggestedEmail", "suggestedById", "organizationId", status, "createdAt", "updatedAt", "updatedById", "updateViewedBySuggester") FROM stdin;
\.


--
-- Data for Name: user_invites; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.user_invites (id, "invitedById", "organizationId", email, "signupToken", expires, "createdAt", "updatedAt", "claimedById", "claimedAt", "userType", metadata) FROM stdin;
\.


--
-- Data for Name: user_login_ip_addresses; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.user_login_ip_addresses (id, "userId", "ipAddress", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: user_session_states; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.user_session_states (id, "userId", "resourceId", key, value, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: user_viewed_features; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.user_viewed_features (id, "featureKey", count, dismissed, "createdAt", "updatedAt", "userId") FROM stdin;
1	mobileSignupFlow	0	f	2024-01-31 14:11:43.955+00	2024-01-31 14:11:43.955+00	1
3	retool-ai-cta	2	f	2024-01-31 14:11:44.012+00	2024-01-31 14:12:21.514+00	1
2	home-page-ctas	2	f	2024-01-31 14:11:43.986+00	2024-01-31 14:12:21.522+00	1
4	retool-ai-settings-cta	2	f	2024-01-31 14:11:44.059+00	2024-01-31 14:12:21.556+00	1
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.users (id, email, "firstName", "lastName", "profilePhotoUrl", "googleId", "googleToken", "hashedPassword", "organizationId", "createdAt", "updatedAt", "lastLoggedIn", enabled, "resetPasswordToken", "resetPasswordExpires", sid, "userName", "twoFactorAuthSecret", "twoFactorAuthEnabled", "lastActive", "salesCTADismissed", "tutorialCTADismissed", "passwordExpiresAt", "passwordlessToken", "passwordlessTokenExpiresAt", "userType", metadata, "externalIdentifier", "githubId") FROM stdin;
1	send@pagopa.it	SEND		\N	\N	\N	$2a$12$V5v7xmyYpdiM1/fXF9ZwNOPm.IQN4KMYmNkAgZEYLQ5uYp4o4vUe.	1	2024-01-31 14:11:33.935+00	2024-01-31 14:11:43.005+00	2024-01-31 14:11:37.370545+00	t	\N	\N	user_01d5aca86c2f4198aa062a73745dbadd	\N	\N	\N	2024-01-31 14:11:37.299741+00	f	f	\N	\N	\N	default	{}	\N	\N
\.


--
-- Data for Name: vectors; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.vectors (id, namespace, description, type, configurations, "organizationId", "updatedAt", "createdAt") FROM stdin;
\.


--
-- Data for Name: vscode_sessions; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.vscode_sessions (id, "organizationId", "userEmail", "sessionUuid", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: vscode_types; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.vscode_types (id, "organizationId", "appUuid", files, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: workflow; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.workflow (id, "organizationId", name, description, crontab, timezone, "isEnabled", "createdAt", "updatedAt", "apiKey", "releaseId", "createdBy", "folderId", protected, "autoEnableLatest", "lastSyncedChecksum", "deletedAt") FROM stdin;
\.


--
-- Data for Name: workflow_aggregate_usage; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.workflow_aggregate_usage (id, "organizationId", "totalInputDataSizeBytes", "totalOutputDataSizeBytes", "createdAt", "updatedAt", "periodStart", "periodEnd", "workflowId", "billableRunsCount") FROM stdin;
\.


--
-- Data for Name: workflow_block_result_location_enum; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.workflow_block_result_location_enum (id) FROM stdin;
postgres
s3
\.


--
-- Data for Name: workflow_block_results; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.workflow_block_results (id, "organizationId", "resultDataBlob", "dataExpiresAt", "createdAt", "updatedAt", "compressionScheme") FROM stdin;
\.


--
-- Data for Name: workflow_block_runs; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.workflow_block_runs (id, "organizationId", "workflowId", "workflowRunId", "blockPluginId", "blockResultLocation", "blockResultKey", "inputDataSizeBytes", "outputDataSizeBytes", status, "createdAt", "updatedAt", "dataExpiresAt") FROM stdin;
\.


--
-- Data for Name: workflow_compression_scheme_enum; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.workflow_compression_scheme_enum (id) FROM stdin;
none
lz4
\.


--
-- Data for Name: workflow_release; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.workflow_release (id, name, description, "workflowId", "workflowSaveId", "creatorUserId", "releaserUserId", "createdAt", "updatedAt", "commitMessage", "gitSha") FROM stdin;
\.


--
-- Data for Name: workflow_run; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.workflow_run (id, "workflowId", status, "logFile", "createdAt", "updatedAt", "createdBy", "inputDataSizeBytes", "outputDataSizeBytes", "completedAt", "workflowSaveId", "triggerType", "blobDataDeletedAt", "triggerId", "environmentId", "callingRetoolEvent") FROM stdin;
\.


--
-- Data for Name: workflow_run_logs; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.workflow_run_logs (id, "organizationId", "workflowId", "workflowRunId", "blockPluginId", "numRetry", "sequenceToken", "logData", "createdAt", "updatedAt", "compressionScheme") FROM stdin;
\.


--
-- Data for Name: workflow_save; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.workflow_save (id, "workflowId", "blockData", "templateData", "createdAt", "updatedAt", "triggerWebhooks", "createdBy", "customLibraries", "pythonLanguageConfigurationId", "javascriptLanguageConfigurationId", "setupScripts", "pythonLanguageConfigurationSaveId", "javascriptLanguageConfigurationSaveId") FROM stdin;
\.


--
-- Data for Name: workflow_tracked_property_usages; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.workflow_tracked_property_usages (id, "propertyIdentifier", "propertyType", "workflowId", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: workflow_trigger; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.workflow_trigger (id, "workflowId", "environmentId", "triggerType", "enabledAt", "triggerOptions", "createdBy", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: workspaces; Type: TABLE DATA; Schema: public; Owner: retool_internal_user
--

COPY public.workspaces (id, "groupId", "homePageId", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Name: app_metadata_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.app_metadata_id_seq', 1, false);


--
-- Name: app_themes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.app_themes_id_seq', 1, false);


--
-- Name: audit_trail_events_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.audit_trail_events_id_seq', 3, true);


--
-- Name: component_metadata_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.component_metadata_id_seq', 1, false);


--
-- Name: custom_component_collection_revision_files_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.custom_component_collection_revision_files_id_seq', 1, false);


--
-- Name: custom_component_collection_revisions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.custom_component_collection_revisions_id_seq', 1, false);


--
-- Name: custom_component_collections_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.custom_component_collections_id_seq', 1, false);


--
-- Name: embeds_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.embeds_id_seq', 1, false);


--
-- Name: experiment_audiences_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.experiment_audiences_id_seq', 1, false);


--
-- Name: experiment_strategies_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.experiment_strategies_id_seq', 2, true);


--
-- Name: experiments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.experiments_id_seq', 2, true);


--
-- Name: features_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.features_id_seq', 1, false);


--
-- Name: flow_input_schemas_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.flow_input_schemas_id_seq', 1, false);


--
-- Name: flow_queries_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.flow_queries_id_seq', 1, false);


--
-- Name: flow_stages_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.flow_stages_id_seq', 1, false);


--
-- Name: flow_task_histories_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.flow_task_histories_id_seq', 1, false);


--
-- Name: flow_task_inputs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.flow_task_inputs_id_seq', 1, false);


--
-- Name: flow_tasks_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.flow_tasks_id_seq', 1, false);


--
-- Name: flows_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.flows_id_seq', 1, false);


--
-- Name: folder_favorites_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.folder_favorites_id_seq', 1, false);


--
-- Name: folders_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.folders_id_seq', 5, true);


--
-- Name: group_folder_defaults_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.group_folder_defaults_id_seq', 1, false);


--
-- Name: group_pages_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.group_pages_id_seq', 1, false);


--
-- Name: group_resource_folder_defaults_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.group_resource_folder_defaults_id_seq', 1, false);


--
-- Name: group_resources_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.group_resources_id_seq', 1, true);


--
-- Name: group_workflows_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.group_workflows_id_seq', 1, false);


--
-- Name: groups_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.groups_id_seq', 4, true);


--
-- Name: instrumentation_integrations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.instrumentation_integrations_id_seq', 1, false);


--
-- Name: organizations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.organizations_id_seq', 1, true);


--
-- Name: page_favorites_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.page_favorites_id_seq', 1, false);


--
-- Name: page_save_playground_query_saves_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.page_save_playground_query_saves_id_seq', 1, false);


--
-- Name: page_saves_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.page_saves_id_seq', 2, true);


--
-- Name: pages_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.pages_id_seq', 1, true);


--
-- Name: plan_features_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.plan_features_id_seq', 1, false);


--
-- Name: plans_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.plans_id_seq', 1, false);


--
-- Name: playground_queries_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.playground_queries_id_seq', 1, true);


--
-- Name: playground_query_saves_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.playground_query_saves_id_seq', 1, true);


--
-- Name: query_metadata_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.query_metadata_id_seq', 1, false);


--
-- Name: resource_folders_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.resource_folders_id_seq', 1, true);


--
-- Name: resources_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.resources_id_seq', 2, true);


--
-- Name: retool_databases_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.retool_databases_id_seq', 1, false);


--
-- Name: retool_db_provision_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.retool_db_provision_id_seq', 1, false);


--
-- Name: retool_managed_note_comment_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.retool_managed_note_comment_id_seq', 1, false);


--
-- Name: retool_managed_note_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.retool_managed_note_id_seq', 1, false);


--
-- Name: retool_table_events_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.retool_table_events_id_seq', 1, false);


--
-- Name: retool_tables_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.retool_tables_id_seq', 1, false);


--
-- Name: role_pages_members_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.role_pages_members_id_seq', 1, false);


--
-- Name: sessions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.sessions_id_seq', 1, true);


--
-- Name: ssh_keys_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.ssh_keys_id_seq', 1, true);


--
-- Name: themes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.themes_id_seq', 1, false);


--
-- Name: tracked_property_usages_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.tracked_property_usages_id_seq', 1, false);


--
-- Name: user_groups_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.user_groups_id_seq', 2, true);


--
-- Name: user_invite_groups_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.user_invite_groups_id_seq', 1, false);


--
-- Name: user_invite_suggestions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.user_invite_suggestions_id_seq', 1, false);


--
-- Name: user_invites_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.user_invites_id_seq', 1, false);


--
-- Name: user_viewed_features_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.user_viewed_features_id_seq', 4, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.users_id_seq', 1, true);


--
-- Name: workspaces_id_seq; Type: SEQUENCE SET; Schema: public; Owner: retool_internal_user
--

SELECT pg_catalog.setval('public.workspaces_id_seq', 1, false);


--
-- Name: SequelizeMeta SequelizeMeta_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public."SequelizeMeta"
    ADD CONSTRAINT "SequelizeMeta_pkey" PRIMARY KEY (name);


--
-- Name: access_control_list_members access_control_list_members_aclId_memberId_memberType_key; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.access_control_list_members
    ADD CONSTRAINT "access_control_list_members_aclId_memberId_memberType_key" UNIQUE ("aclId", "memberId", "memberType");


--
-- Name: access_control_list_members access_control_list_members_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.access_control_list_members
    ADD CONSTRAINT access_control_list_members_pkey PRIMARY KEY (id);


--
-- Name: access_control_lists access_control_lists_accessLevel_entityId_entityType_key; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.access_control_lists
    ADD CONSTRAINT "access_control_lists_accessLevel_entityId_entityType_key" UNIQUE ("accessLevel", "entityId", "entityType");


--
-- Name: access_control_lists access_control_lists_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.access_control_lists
    ADD CONSTRAINT access_control_lists_pkey PRIMARY KEY (id);


--
-- Name: api_keys api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_pkey PRIMARY KEY (uuid);


--
-- Name: app_metadata app_metadata_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.app_metadata
    ADD CONSTRAINT app_metadata_pkey PRIMARY KEY (id);


--
-- Name: app_themes app_themes_name_organization_id_uk; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.app_themes
    ADD CONSTRAINT app_themes_name_organization_id_uk UNIQUE (name, organization_id);


--
-- Name: app_themes app_themes_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.app_themes
    ADD CONSTRAINT app_themes_pkey PRIMARY KEY (id);


--
-- Name: approval_task_executions approval_task_executions_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.approval_task_executions
    ADD CONSTRAINT approval_task_executions_pkey PRIMARY KEY (uuid);


--
-- Name: approval_task_items approval_task_items_namespace_key_key; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.approval_task_items
    ADD CONSTRAINT approval_task_items_namespace_key_key UNIQUE (namespace, key);


--
-- Name: approval_task_items approval_task_items_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.approval_task_items
    ADD CONSTRAINT approval_task_items_pkey PRIMARY KEY (uuid);


--
-- Name: approval_task_votes approval_task_votes_approvalTaskUuid_userId_key; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.approval_task_votes
    ADD CONSTRAINT "approval_task_votes_approvalTaskUuid_userId_key" UNIQUE ("approvalTaskUuid", "userId");


--
-- Name: approval_task_votes approval_task_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.approval_task_votes
    ADD CONSTRAINT approval_task_votes_pkey PRIMARY KEY (uuid);


--
-- Name: appstore_tags appstore_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.appstore_tags
    ADD CONSTRAINT appstore_tags_pkey PRIMARY KEY (uuid);


--
-- Name: audit_trail_events audit_trail_events_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.audit_trail_events
    ADD CONSTRAINT audit_trail_events_pkey PRIMARY KEY (id);


--
-- Name: bad_passwords bad_passwords_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.bad_passwords
    ADD CONSTRAINT bad_passwords_pkey PRIMARY KEY (id);


--
-- Name: block_saves block_saves_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.block_saves
    ADD CONSTRAINT block_saves_pkey PRIMARY KEY (id);


--
-- Name: blocks blocks_name_organizationId_key; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.blocks
    ADD CONSTRAINT "blocks_name_organizationId_key" UNIQUE (name, "organizationId");


--
-- Name: blocks blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.blocks
    ADD CONSTRAINT blocks_pkey PRIMARY KEY (id);


--
-- Name: blueprints blueprints_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.blueprints
    ADD CONSTRAINT blueprints_pkey PRIMARY KEY (uuid);


--
-- Name: branches branches_name_organizationId_key; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT "branches_name_organizationId_key" UNIQUE (name, "organizationId");


--
-- Name: branches branches_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_pkey PRIMARY KEY (id);


--
-- Name: commits commits_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.commits
    ADD CONSTRAINT commits_pkey PRIMARY KEY (id);


--
-- Name: component_metadata component_metadata_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.component_metadata
    ADD CONSTRAINT component_metadata_pkey PRIMARY KEY (id);


--
-- Name: config_var_values config_var_values_configVarUuid_environmentId_uk; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.config_var_values
    ADD CONSTRAINT "config_var_values_configVarUuid_environmentId_uk" UNIQUE ("configVarUuid", "environmentId");


--
-- Name: config_var_values config_var_values_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.config_var_values
    ADD CONSTRAINT config_var_values_pkey PRIMARY KEY (uuid);


--
-- Name: config_vars config_vars_name_organizationId_uk; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.config_vars
    ADD CONSTRAINT "config_vars_name_organizationId_uk" UNIQUE (name, "organizationId");


--
-- Name: config_vars config_vars_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.config_vars
    ADD CONSTRAINT config_vars_pkey PRIMARY KEY (uuid);


--
-- Name: custom_component_collection_revision_files custom_component_collection_revision_files_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.custom_component_collection_revision_files
    ADD CONSTRAINT custom_component_collection_revision_files_pkey PRIMARY KEY (id);


--
-- Name: custom_component_collection_revision_files custom_component_collection_revision_files_unique_filepath_per_; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.custom_component_collection_revision_files
    ADD CONSTRAINT custom_component_collection_revision_files_unique_filepath_per_ UNIQUE ("customComponentCollectionRevisionId", filepath);


--
-- Name: custom_component_collection_revisions custom_component_collection_revisions_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.custom_component_collection_revisions
    ADD CONSTRAINT custom_component_collection_revisions_pkey PRIMARY KEY (id);


--
-- Name: custom_component_collection_revisions custom_component_collection_revisions_unique_version_per_collec; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.custom_component_collection_revisions
    ADD CONSTRAINT custom_component_collection_revisions_unique_version_per_collec UNIQUE ("customComponentCollectionId", version);


--
-- Name: custom_component_collection_revisions custom_component_collection_revisions_uuid_key; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.custom_component_collection_revisions
    ADD CONSTRAINT custom_component_collection_revisions_uuid_key UNIQUE (uuid);


--
-- Name: custom_component_collections custom_component_collections_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.custom_component_collections
    ADD CONSTRAINT custom_component_collections_pkey PRIMARY KEY (id);


--
-- Name: custom_component_collections custom_component_collections_unique_name_per_organization; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.custom_component_collections
    ADD CONSTRAINT custom_component_collections_unique_name_per_organization UNIQUE ("organizationId", name);


--
-- Name: custom_component_collections custom_component_collections_uuid_key; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.custom_component_collections
    ADD CONSTRAINT custom_component_collections_uuid_key UNIQUE (uuid);


--
-- Name: custom_domains custom_domains_domain_uk; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.custom_domains
    ADD CONSTRAINT custom_domains_domain_uk UNIQUE (domain);


--
-- Name: custom_domains custom_domains_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.custom_domains
    ADD CONSTRAINT custom_domains_pkey PRIMARY KEY (id);


--
-- Name: dg_activity dg_activity_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.dg_activity
    ADD CONSTRAINT dg_activity_pkey PRIMARY KEY (id);


--
-- Name: dg_bulk_edit dg_bulk_edit_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.dg_bulk_edit
    ADD CONSTRAINT dg_bulk_edit_pkey PRIMARY KEY (id);


--
-- Name: dg_grid dg_grid_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.dg_grid
    ADD CONSTRAINT dg_grid_pkey PRIMARY KEY (id);


--
-- Name: dg_single_edit dg_single_edit_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.dg_single_edit
    ADD CONSTRAINT dg_single_edit_pkey PRIMARY KEY (id);


--
-- Name: embeds embeds_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.embeds
    ADD CONSTRAINT embeds_pkey PRIMARY KEY (id);


--
-- Name: environment_config_vars environment_config_vars_environmentId_key_uk; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.environment_config_vars
    ADD CONSTRAINT "environment_config_vars_environmentId_key_uk" UNIQUE ("environmentId", key);


--
-- Name: environment_config_vars environment_config_vars_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.environment_config_vars
    ADD CONSTRAINT environment_config_vars_pkey PRIMARY KEY (id);


--
-- Name: environments environments_organizationId_name_uk; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.environments
    ADD CONSTRAINT "environments_organizationId_name_uk" UNIQUE ("organizationId", name);


--
-- Name: environments environments_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.environments
    ADD CONSTRAINT environments_pkey PRIMARY KEY (id);


--
-- Name: environments envrironments_organization_id_display_color_unique; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.environments
    ADD CONSTRAINT envrironments_organization_id_display_color_unique UNIQUE ("organizationId", "displayColor");


--
-- Name: event_workflows event_workflows_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.event_workflows
    ADD CONSTRAINT event_workflows_pkey PRIMARY KEY (id);


--
-- Name: experiment_audiences experiment_audiences_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.experiment_audiences
    ADD CONSTRAINT experiment_audiences_pkey PRIMARY KEY (id);


--
-- Name: experiment_strategies experiment_strategies_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.experiment_strategies
    ADD CONSTRAINT experiment_strategies_pkey PRIMARY KEY (id);


--
-- Name: experiments experiments_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.experiments
    ADD CONSTRAINT experiments_pkey PRIMARY KEY (id);


--
-- Name: external_embed_sessions external_embed_session_token_unique; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.external_embed_sessions
    ADD CONSTRAINT external_embed_session_token_unique UNIQUE (token);


--
-- Name: external_embed_sessions external_embed_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.external_embed_sessions
    ADD CONSTRAINT external_embed_sessions_pkey PRIMARY KEY (id);


--
-- Name: external_users external_users_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.external_users
    ADD CONSTRAINT external_users_pkey PRIMARY KEY (id);


--
-- Name: features features_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.features
    ADD CONSTRAINT features_pkey PRIMARY KEY (id);


--
-- Name: flow_input_schemas flow_input_schemas_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.flow_input_schemas
    ADD CONSTRAINT flow_input_schemas_pkey PRIMARY KEY (id);


--
-- Name: flow_queries flow_queries_flowStageId_key; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.flow_queries
    ADD CONSTRAINT "flow_queries_flowStageId_key" UNIQUE ("flowStageId");


--
-- Name: flow_queries flow_queries_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.flow_queries
    ADD CONSTRAINT flow_queries_pkey PRIMARY KEY (id);


--
-- Name: flow_stages flow_stages_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.flow_stages
    ADD CONSTRAINT flow_stages_pkey PRIMARY KEY (id);


--
-- Name: flow_task_histories flow_task_histories_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.flow_task_histories
    ADD CONSTRAINT flow_task_histories_pkey PRIMARY KEY (id);


--
-- Name: flow_task_inputs flow_task_inputs_flowInputSchemaId_taskId; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.flow_task_inputs
    ADD CONSTRAINT "flow_task_inputs_flowInputSchemaId_taskId" UNIQUE ("flowInputSchemaId", "taskId");


--
-- Name: flow_task_inputs flow_task_inputs_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.flow_task_inputs
    ADD CONSTRAINT flow_task_inputs_pkey PRIMARY KEY (id);


--
-- Name: flow_tasks flow_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.flow_tasks
    ADD CONSTRAINT flow_tasks_pkey PRIMARY KEY (id);


--
-- Name: flows flows_organizationId_name; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.flows
    ADD CONSTRAINT "flows_organizationId_name" UNIQUE ("organizationId", name);


--
-- Name: flows flows_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.flows
    ADD CONSTRAINT flows_pkey PRIMARY KEY (id);


--
-- Name: folder_favorites folder_favorites_folderId_userId_key; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.folder_favorites
    ADD CONSTRAINT "folder_favorites_folderId_userId_key" UNIQUE ("folderId", "userId");


--
-- Name: folder_favorites folder_favorites_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.folder_favorites
    ADD CONSTRAINT folder_favorites_pkey PRIMARY KEY (id);


--
-- Name: folders folders_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.folders
    ADD CONSTRAINT folders_pkey PRIMARY KEY (id);


--
-- Name: form_fields form_fields_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.form_fields
    ADD CONSTRAINT form_fields_pkey PRIMARY KEY (id);


--
-- Name: forms forms_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.forms
    ADD CONSTRAINT forms_pkey PRIMARY KEY (id);


--
-- Name: grid_field grid_field_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.grid_field
    ADD CONSTRAINT grid_field_pkey PRIMARY KEY (id);


--
-- Name: grid_group_access grid_group_access_gridId_groupId_uk; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.grid_group_access
    ADD CONSTRAINT "grid_group_access_gridId_groupId_uk" UNIQUE ("gridId", "groupId");


--
-- Name: grid_group_access grid_group_access_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.grid_group_access
    ADD CONSTRAINT grid_group_access_pkey PRIMARY KEY (id);


--
-- Name: grid_managed_cluster_resources grid_managed_cluster_resources_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.grid_managed_cluster_resources
    ADD CONSTRAINT grid_managed_cluster_resources_pkey PRIMARY KEY (id);


--
-- Name: grid_managed_clusters grid_managed_clusters_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.grid_managed_clusters
    ADD CONSTRAINT grid_managed_clusters_pkey PRIMARY KEY (id);


--
-- Name: grid_table_group_access grid_table_group_access_gridId_table_groupId_uk; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.grid_table_group_access
    ADD CONSTRAINT "grid_table_group_access_gridId_table_groupId_uk" UNIQUE ("gridId", "table", "groupId");


--
-- Name: grid_table_group_access grid_table_group_access_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.grid_table_group_access
    ADD CONSTRAINT grid_table_group_access_pkey PRIMARY KEY (id);


--
-- Name: grid_table_user_access grid_table_user_access_gridId_table_userId_uk; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.grid_table_user_access
    ADD CONSTRAINT "grid_table_user_access_gridId_table_userId_uk" UNIQUE ("gridId", "table", "userId");


--
-- Name: grid_table_user_access grid_table_user_access_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.grid_table_user_access
    ADD CONSTRAINT grid_table_user_access_pkey PRIMARY KEY (id);


--
-- Name: grid_user_access grid_user_access_gridId_userId_uk; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.grid_user_access
    ADD CONSTRAINT "grid_user_access_gridId_userId_uk" UNIQUE ("gridId", "userId");


--
-- Name: grid_user_access grid_user_access_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.grid_user_access
    ADD CONSTRAINT grid_user_access_pkey PRIMARY KEY (id);


--
-- Name: grid_view grid_view_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.grid_view
    ADD CONSTRAINT grid_view_pkey PRIMARY KEY (id);


--
-- Name: group_folder_defaults group_folder_defaults_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.group_folder_defaults
    ADD CONSTRAINT group_folder_defaults_pkey PRIMARY KEY (id);


--
-- Name: group_folder_defaults group_folder_groupId_folderId_key; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.group_folder_defaults
    ADD CONSTRAINT "group_folder_groupId_folderId_key" UNIQUE ("groupId", "folderId");


--
-- Name: group_pages group_pages_groupId_pageId_key; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.group_pages
    ADD CONSTRAINT "group_pages_groupId_pageId_key" UNIQUE ("groupId", "pageId");


--
-- Name: group_pages group_pages_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.group_pages
    ADD CONSTRAINT group_pages_pkey PRIMARY KEY (id);


--
-- Name: group_resource_folder_defaults group_resource_folder_defaults_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.group_resource_folder_defaults
    ADD CONSTRAINT group_resource_folder_defaults_pkey PRIMARY KEY (id);


--
-- Name: group_resources group_resources_groupId_resourceIdForEnv_key; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.group_resources
    ADD CONSTRAINT "group_resources_groupId_resourceIdForEnv_key" UNIQUE ("groupId", "resourceIdForEnv");


--
-- Name: group_resources group_resources_groupId_resourceId_key; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.group_resources
    ADD CONSTRAINT "group_resources_groupId_resourceId_key" UNIQUE ("groupId", "resourceId");


--
-- Name: group_resources group_resources_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.group_resources
    ADD CONSTRAINT group_resources_pkey PRIMARY KEY (id);


--
-- Name: group_workflows group_workflows_groupId_workflowId_key; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.group_workflows
    ADD CONSTRAINT "group_workflows_groupId_workflowId_key" UNIQUE ("groupId", "workflowId");


--
-- Name: group_workflows group_workflows_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.group_workflows
    ADD CONSTRAINT group_workflows_pkey PRIMARY KEY (id);


--
-- Name: groups groups_name_organizationId_key; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT "groups_name_organizationId_key" UNIQUE (name, "organizationId");


--
-- Name: groups groups_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_pkey PRIMARY KEY (id);


--
-- Name: iam_credentials iam_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.iam_credentials
    ADD CONSTRAINT iam_credentials_pkey PRIMARY KEY (uuid);


--
-- Name: instrumentation_integrations instrumentation_integrations_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.instrumentation_integrations
    ADD CONSTRAINT instrumentation_integrations_pkey PRIMARY KEY (id);


--
-- Name: language_configuration language_configuration_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.language_configuration
    ADD CONSTRAINT language_configuration_pkey PRIMARY KEY (id);


--
-- Name: language_configuration_save language_configuration_save_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.language_configuration_save
    ADD CONSTRAINT language_configuration_save_pkey PRIMARY KEY (id);


--
-- Name: notification_applications notification_applications_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.notification_applications
    ADD CONSTRAINT notification_applications_pkey PRIMARY KEY (id);


--
-- Name: notification_subscribed_devices notification_subscribed_devices_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.notification_subscribed_devices
    ADD CONSTRAINT notification_subscribed_devices_pkey PRIMARY KEY (id);


--
-- Name: notification_topic_subscriptions notification_topic_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.notification_topic_subscriptions
    ADD CONSTRAINT notification_topic_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: org_image_blobs org_image_blobs_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.org_image_blobs
    ADD CONSTRAINT org_image_blobs_pkey PRIMARY KEY (id);


--
-- Name: organization_email_domains organization_email_domains_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.organization_email_domains
    ADD CONSTRAINT organization_email_domains_pkey PRIMARY KEY (id);


--
-- Name: organization_user_attributes organization_user_attributes_organizationId_name_uk; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.organization_user_attributes
    ADD CONSTRAINT "organization_user_attributes_organizationId_name_uk" UNIQUE ("organizationId", name);


--
-- Name: organization_user_attributes organization_user_attributes_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.organization_user_attributes
    ADD CONSTRAINT organization_user_attributes_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_defaultAppThemeId_key; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT "organizations_defaultAppThemeId_key" UNIQUE ("defaultAppThemeId");


--
-- Name: organizations organizations_domain_key; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_domain_key UNIQUE (domain);


--
-- Name: organizations organizations_domain_key1; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_domain_key1 UNIQUE (domain);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_sid_key; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_sid_key UNIQUE (sid);


--
-- Name: organizations organizations_subdomain_key; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_subdomain_key UNIQUE (subdomain);


--
-- Name: organizations organizations_themeId_key; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT "organizations_themeId_key" UNIQUE ("themeId");


--
-- Name: page_docs page_docs_pageId_key; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.page_docs
    ADD CONSTRAINT "page_docs_pageId_key" UNIQUE ("pageId");


--
-- Name: page_docs page_docs_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.page_docs
    ADD CONSTRAINT page_docs_pkey PRIMARY KEY (id);


--
-- Name: page_favorites page_favorites_pageId_userId_key; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.page_favorites
    ADD CONSTRAINT "page_favorites_pageId_userId_key" UNIQUE ("pageId", "userId");


--
-- Name: page_favorites page_favorites_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.page_favorites
    ADD CONSTRAINT page_favorites_pkey PRIMARY KEY (id);


--
-- Name: page_onboarding_state page_onboarding_state_pageId_key; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.page_onboarding_state
    ADD CONSTRAINT "page_onboarding_state_pageId_key" UNIQUE ("pageId");


--
-- Name: page_onboarding_state page_onboarding_state_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.page_onboarding_state
    ADD CONSTRAINT page_onboarding_state_pkey PRIMARY KEY (id);


--
-- Name: page_save_playground_query_saves page_save_playground_query_saves_pageSaveId_playgroundQuerySave; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.page_save_playground_query_saves
    ADD CONSTRAINT "page_save_playground_query_saves_pageSaveId_playgroundQuerySave" UNIQUE ("pageSaveId", "playgroundQuerySaveId");


--
-- Name: page_save_playground_query_saves page_save_playground_query_saves_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.page_save_playground_query_saves
    ADD CONSTRAINT page_save_playground_query_saves_pkey PRIMARY KEY (id);


--
-- Name: page_saves page_saves_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.page_saves
    ADD CONSTRAINT page_saves_pkey PRIMARY KEY (id);


--
-- Name: recently_visited_apps page_user_key; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.recently_visited_apps
    ADD CONSTRAINT page_user_key UNIQUE ("pageId", "userId");


--
-- Name: page_user_heartbeats page_user_mode_key; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.page_user_heartbeats
    ADD CONSTRAINT page_user_mode_key PRIMARY KEY ("pageId", "userId", mode);


--
-- Name: pages pages_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.pages
    ADD CONSTRAINT pages_pkey PRIMARY KEY (id);


--
-- Name: pages pages_uuid_key; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.pages
    ADD CONSTRAINT pages_uuid_key UNIQUE (uuid);


--
-- Name: partially_registered_users partially_registered_users_email_key; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.partially_registered_users
    ADD CONSTRAINT partially_registered_users_email_key UNIQUE (email);


--
-- Name: partially_registered_users partially_registered_users_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.partially_registered_users
    ADD CONSTRAINT partially_registered_users_pkey PRIMARY KEY (id);


--
-- Name: partially_registered_users partially_registered_users_registrationToken_key; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.partially_registered_users
    ADD CONSTRAINT "partially_registered_users_registrationToken_key" UNIQUE ("registrationToken");


--
-- Name: personal_access_tokens personal_access_tokens_hashedKey_key; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.personal_access_tokens
    ADD CONSTRAINT "personal_access_tokens_hashedKey_key" UNIQUE ("hashedKey");


--
-- Name: personal_access_tokens personal_access_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.personal_access_tokens
    ADD CONSTRAINT personal_access_tokens_pkey PRIMARY KEY (id);


--
-- Name: plan_features plan_features_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.plan_features
    ADD CONSTRAINT plan_features_pkey PRIMARY KEY (id);


--
-- Name: plans plans_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_pkey PRIMARY KEY (id);


--
-- Name: playground_queries playground_queries_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.playground_queries
    ADD CONSTRAINT playground_queries_pkey PRIMARY KEY (id);


--
-- Name: playground_queries playground_queries_uuid_key; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.playground_queries
    ADD CONSTRAINT playground_queries_uuid_key UNIQUE (uuid);


--
-- Name: playground_query_saves playground_query_saves_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.playground_query_saves
    ADD CONSTRAINT playground_query_saves_pkey PRIMARY KEY (id);


--
-- Name: playground_query_saves playground_query_saves_uuid_key; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.playground_query_saves
    ADD CONSTRAINT playground_query_saves_uuid_key UNIQUE (uuid);


--
-- Name: query_metadata query_metadata_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.query_metadata
    ADD CONSTRAINT query_metadata_pkey PRIMARY KEY (id);


--
-- Name: resource_folders resource_folders_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.resource_folders
    ADD CONSTRAINT resource_folders_pkey PRIMARY KEY (id);


--
-- Name: resource_preview_hints resource_preview_hints_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.resource_preview_hints
    ADD CONSTRAINT resource_preview_hints_pkey PRIMARY KEY (id);


--
-- Name: resources resources_organizationId_folderId_displayName_environmentId_key; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.resources
    ADD CONSTRAINT "resources_organizationId_folderId_displayName_environmentId_key" UNIQUE ("organizationId", "resourceFolderId", "displayName", "environmentId");


--
-- Name: resources resources_organizationId_name_environment_key; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.resources
    ADD CONSTRAINT "resources_organizationId_name_environment_key" UNIQUE ("organizationId", name, environment);


--
-- Name: resources resources_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.resources
    ADD CONSTRAINT resources_pkey PRIMARY KEY (id);


--
-- Name: resources resources_uuid_key; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.resources
    ADD CONSTRAINT resources_uuid_key UNIQUE (uuid);


--
-- Name: retool_databases retool_databases_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.retool_databases
    ADD CONSTRAINT retool_databases_pkey PRIMARY KEY (id);


--
-- Name: retool_db_migrations retool_db_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.retool_db_migrations
    ADD CONSTRAINT retool_db_migrations_pkey PRIMARY KEY (id);


--
-- Name: retool_db_provision retool_db_provision_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.retool_db_provision
    ADD CONSTRAINT retool_db_provision_pkey PRIMARY KEY (id);


--
-- Name: retool_files retool_files_organizationId_resourceId_name_folderId_key; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.retool_files
    ADD CONSTRAINT "retool_files_organizationId_resourceId_name_folderId_key" UNIQUE ("organizationId", "resourceId", name, "folderId");


--
-- Name: retool_files retool_files_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.retool_files
    ADD CONSTRAINT retool_files_pkey PRIMARY KEY (id);


--
-- Name: retool_managed_note_comment retool_managed_note_comment_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.retool_managed_note_comment
    ADD CONSTRAINT retool_managed_note_comment_pkey PRIMARY KEY (id);


--
-- Name: retool_managed_note retool_managed_note_evaluatedKey_organizationId_key; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.retool_managed_note
    ADD CONSTRAINT "retool_managed_note_evaluatedKey_organizationId_key" UNIQUE ("evaluatedKey", "organizationId");


--
-- Name: retool_managed_note retool_managed_note_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.retool_managed_note
    ADD CONSTRAINT retool_managed_note_pkey PRIMARY KEY (id);


--
-- Name: retool_rules retool_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.retool_rules
    ADD CONSTRAINT retool_rules_pkey PRIMARY KEY (id);


--
-- Name: retool_table_events retool_table_events_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.retool_table_events
    ADD CONSTRAINT retool_table_events_pkey PRIMARY KEY (id);


--
-- Name: retool_tables retool_tables_database_id_table_name_key; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.retool_tables
    ADD CONSTRAINT retool_tables_database_id_table_name_key UNIQUE ("retoolDatabaseId", "tableName");


--
-- Name: retool_tables retool_tables_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.retool_tables
    ADD CONSTRAINT retool_tables_pkey PRIMARY KEY (id);


--
-- Name: role_pages_members role_pages_members_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.role_pages_members
    ADD CONSTRAINT role_pages_members_pkey PRIMARY KEY (id);


--
-- Name: role_pages role_pages_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.role_pages
    ADD CONSTRAINT role_pages_pkey PRIMARY KEY (id);


--
-- Name: secrets_manager_configs secrets_manager_configs_organizationId_key; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.secrets_manager_configs
    ADD CONSTRAINT "secrets_manager_configs_organizationId_key" UNIQUE ("organizationId");


--
-- Name: secrets_manager_configs secrets_manager_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.secrets_manager_configs
    ADD CONSTRAINT secrets_manager_configs_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: source_control_deployment_settings source_control_deployment_organization_id_unique; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.source_control_deployment_settings
    ADD CONSTRAINT source_control_deployment_organization_id_unique UNIQUE ("organizationId");


--
-- Name: source_control_deployment_settings source_control_deployment_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.source_control_deployment_settings
    ADD CONSTRAINT source_control_deployment_settings_pkey PRIMARY KEY (id);


--
-- Name: source_control_deployments source_control_deployments_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.source_control_deployments
    ADD CONSTRAINT source_control_deployments_pkey PRIMARY KEY (id);


--
-- Name: source_control_protection_status source_control_protection_status_elementType_elementUuid_uk; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.source_control_protection_status
    ADD CONSTRAINT "source_control_protection_status_elementType_elementUuid_uk" UNIQUE ("elementType", "elementUuid");


--
-- Name: source_control_protection_status source_control_protection_status_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.source_control_protection_status
    ADD CONSTRAINT source_control_protection_status_pkey PRIMARY KEY (id);


--
-- Name: source_control_provider_configs source_control_provider_configs_organizationId_key; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.source_control_provider_configs
    ADD CONSTRAINT "source_control_provider_configs_organizationId_key" UNIQUE ("organizationId");


--
-- Name: source_control_provider_configs source_control_provider_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.source_control_provider_configs
    ADD CONSTRAINT source_control_provider_configs_pkey PRIMARY KEY (id);


--
-- Name: source_control_relationships source_control_relationships_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.source_control_relationships
    ADD CONSTRAINT source_control_relationships_pkey PRIMARY KEY (id);


--
-- Name: source_control_repo_migration_logs source_control_repo_migration_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.source_control_repo_migration_logs
    ADD CONSTRAINT source_control_repo_migration_logs_pkey PRIMARY KEY (id);


--
-- Name: source_control_repo_migrations source_control_repo_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.source_control_repo_migrations
    ADD CONSTRAINT source_control_repo_migrations_pkey PRIMARY KEY (id);


--
-- Name: source_control_settings source_control_settings_organizationId_key; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.source_control_settings
    ADD CONSTRAINT "source_control_settings_organizationId_key" UNIQUE ("organizationId");


--
-- Name: source_control_settings source_control_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.source_control_settings
    ADD CONSTRAINT source_control_settings_pkey PRIMARY KEY (id);


--
-- Name: source_control_user_info source_control_user_info_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.source_control_user_info
    ADD CONSTRAINT source_control_user_info_pkey PRIMARY KEY (id);


--
-- Name: source_control_uuid_mappings source_control_uuid_mappings_globalUuid_elementUuid_uk; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.source_control_uuid_mappings
    ADD CONSTRAINT "source_control_uuid_mappings_globalUuid_elementUuid_uk" UNIQUE ("globalUuid", "elementUuid");


--
-- Name: source_control_uuid_mappings source_control_uuid_mappings_organizationId_elementUuid_element; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.source_control_uuid_mappings
    ADD CONSTRAINT "source_control_uuid_mappings_organizationId_elementUuid_element" UNIQUE ("organizationId", "elementUuid", "elementType");


--
-- Name: source_control_uuid_mappings source_control_uuid_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.source_control_uuid_mappings
    ADD CONSTRAINT source_control_uuid_mappings_pkey PRIMARY KEY (id);


--
-- Name: ssh_keys ssh_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.ssh_keys
    ADD CONSTRAINT ssh_keys_pkey PRIMARY KEY (id);


--
-- Name: startup_programs startup_programs_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.startup_programs
    ADD CONSTRAINT startup_programs_pkey PRIMARY KEY ("organizationId");


--
-- Name: storage_blobs storage_blobs_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.storage_blobs
    ADD CONSTRAINT storage_blobs_pkey PRIMARY KEY (id);


--
-- Name: tags tags_name_pageId_key; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT "tags_name_pageId_key" UNIQUE (name, "pageId");


--
-- Name: tags tags_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_pkey PRIMARY KEY (id);


--
-- Name: temporal_cloud_settings temporal_cloud_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.temporal_cloud_settings
    ADD CONSTRAINT temporal_cloud_settings_pkey PRIMARY KEY (id);


--
-- Name: temporal_cloud_tls_configs temporal_cloud_tls_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.temporal_cloud_tls_configs
    ADD CONSTRAINT temporal_cloud_tls_configs_pkey PRIMARY KEY (id);


--
-- Name: themes themes_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.themes
    ADD CONSTRAINT themes_pkey PRIMARY KEY (id);


--
-- Name: tracked_property_usages tracked_property_usages_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.tracked_property_usages
    ADD CONSTRAINT tracked_property_usages_pkey PRIMARY KEY (id);


--
-- Name: tracked_property_usages tracked_property_usages_propertyIdentifier_propertyType_pageId_; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.tracked_property_usages
    ADD CONSTRAINT "tracked_property_usages_propertyIdentifier_propertyType_pageId_" UNIQUE ("propertyIdentifier", "propertyType", "pageId");


--
-- Name: source_control_user_info userId_organizationId_unique_constraint; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.source_control_user_info
    ADD CONSTRAINT "userId_organizationId_unique_constraint" UNIQUE ("userId", "organizationId");


--
-- Name: user_groups user_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.user_groups
    ADD CONSTRAINT user_groups_pkey PRIMARY KEY (id);


--
-- Name: user_groups user_groups_userId_groupId_key; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.user_groups
    ADD CONSTRAINT "user_groups_userId_groupId_key" UNIQUE ("userId", "groupId");


--
-- Name: user_invite_groups user_invite_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.user_invite_groups
    ADD CONSTRAINT user_invite_groups_pkey PRIMARY KEY (id);


--
-- Name: user_invite_groups user_invite_groups_userInviteId_groupId_key; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.user_invite_groups
    ADD CONSTRAINT "user_invite_groups_userInviteId_groupId_key" UNIQUE ("userInviteId", "groupId");


--
-- Name: user_invite_suggestions user_invite_suggestions_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.user_invite_suggestions
    ADD CONSTRAINT user_invite_suggestions_pkey PRIMARY KEY (id);


--
-- Name: user_invites user_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.user_invites
    ADD CONSTRAINT user_invites_pkey PRIMARY KEY (id);


--
-- Name: user_login_ip_addresses user_login_ip_addresses_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.user_login_ip_addresses
    ADD CONSTRAINT user_login_ip_addresses_pkey PRIMARY KEY (id);


--
-- Name: user_session_states user_session_states_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.user_session_states
    ADD CONSTRAINT user_session_states_pkey PRIMARY KEY (id);


--
-- Name: user_session_states user_session_states_userId_resourceId_key_key; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.user_session_states
    ADD CONSTRAINT "user_session_states_userId_resourceId_key_key" UNIQUE ("userId", "resourceId", key);


--
-- Name: user_viewed_features user_viewed_features_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.user_viewed_features
    ADD CONSTRAINT user_viewed_features_pkey PRIMARY KEY (id);


--
-- Name: users users_email_organizationId_key; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "users_email_organizationId_key" UNIQUE (email, "organizationId");


--
-- Name: users users_externalIdentifier_organizationId_key; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "users_externalIdentifier_organizationId_key" UNIQUE ("externalIdentifier", "organizationId");


--
-- Name: users users_googleId_organizationId_key; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "users_googleId_organizationId_key" UNIQUE ("googleId", "organizationId");


--
-- Name: users users_googleToken_key; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "users_googleToken_key" UNIQUE ("googleToken");


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_sid_key; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_sid_key UNIQUE (sid);


--
-- Name: users users_userName_key; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "users_userName_key" UNIQUE ("userName");


--
-- Name: vectors vectors_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.vectors
    ADD CONSTRAINT vectors_pkey PRIMARY KEY (id);


--
-- Name: vscode_sessions vscode_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.vscode_sessions
    ADD CONSTRAINT vscode_sessions_pkey PRIMARY KEY (id);


--
-- Name: vscode_types vscode_types_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.vscode_types
    ADD CONSTRAINT vscode_types_pkey PRIMARY KEY (id);


--
-- Name: workflow_aggregate_usage workflow_aggregate_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.workflow_aggregate_usage
    ADD CONSTRAINT workflow_aggregate_usage_pkey PRIMARY KEY (id);


--
-- Name: workflow workflow_apiKey_key; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.workflow
    ADD CONSTRAINT "workflow_apiKey_key" UNIQUE ("apiKey");


--
-- Name: workflow_block_result_location_enum workflow_block_result_location_enum_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.workflow_block_result_location_enum
    ADD CONSTRAINT workflow_block_result_location_enum_pkey PRIMARY KEY (id);


--
-- Name: workflow_block_results workflow_block_results_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.workflow_block_results
    ADD CONSTRAINT workflow_block_results_pkey PRIMARY KEY (id);


--
-- Name: workflow_block_runs workflow_block_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.workflow_block_runs
    ADD CONSTRAINT workflow_block_runs_pkey PRIMARY KEY (id);


--
-- Name: workflow_compression_scheme_enum workflow_compression_scheme_enum_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.workflow_compression_scheme_enum
    ADD CONSTRAINT workflow_compression_scheme_enum_pkey PRIMARY KEY (id);


--
-- Name: workflow workflow_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.workflow
    ADD CONSTRAINT workflow_pkey PRIMARY KEY (id);


--
-- Name: workflow_release workflow_release_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.workflow_release
    ADD CONSTRAINT workflow_release_pkey PRIMARY KEY (id);


--
-- Name: workflow_run_logs workflow_run_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.workflow_run_logs
    ADD CONSTRAINT workflow_run_logs_pkey PRIMARY KEY (id);


--
-- Name: workflow_run workflow_run_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.workflow_run
    ADD CONSTRAINT workflow_run_pkey PRIMARY KEY (id);


--
-- Name: workflow_save workflow_save_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.workflow_save
    ADD CONSTRAINT workflow_save_pkey PRIMARY KEY (id);


--
-- Name: workflow_tracked_property_usages workflow_tracked_property_usages_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.workflow_tracked_property_usages
    ADD CONSTRAINT workflow_tracked_property_usages_pkey PRIMARY KEY (id);


--
-- Name: workflow_tracked_property_usages workflow_tracked_property_usages_propertyIdentifier_propertyTyp; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.workflow_tracked_property_usages
    ADD CONSTRAINT "workflow_tracked_property_usages_propertyIdentifier_propertyTyp" UNIQUE ("propertyIdentifier", "propertyType", "workflowId");


--
-- Name: workflow_trigger workflow_trigger_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.workflow_trigger
    ADD CONSTRAINT workflow_trigger_pkey PRIMARY KEY (id);


--
-- Name: workspaces workspaces_groupId_key; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT "workspaces_groupId_key" UNIQUE ("groupId");


--
-- Name: workspaces workspaces_pkey; Type: CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_pkey PRIMARY KEY (id);


--
-- Name: access_control_list_members_acl_id; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX access_control_list_members_acl_id ON public.access_control_list_members USING btree ("aclId");


--
-- Name: access_control_list_members_memberid_membertype; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX access_control_list_members_memberid_membertype ON public.access_control_list_members USING btree ("memberId", "memberType");


--
-- Name: access_control_list_members_membertype; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX access_control_list_members_membertype ON public.access_control_list_members USING btree ("memberType");


--
-- Name: access_control_lists_entityid_entitytype; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX access_control_lists_entityid_entitytype ON public.access_control_lists USING btree ("entityId", "entityType");


--
-- Name: access_control_lists_entitytype; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX access_control_lists_entitytype ON public.access_control_lists USING btree ("entityType");


--
-- Name: access_control_lists_organization_id; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX access_control_lists_organization_id ON public.access_control_lists USING btree ("organizationId");


--
-- Name: app_themes_organization_id; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX app_themes_organization_id ON public.app_themes USING btree (organization_id);


--
-- Name: audit_trail_events_action_type; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX audit_trail_events_action_type ON public.audit_trail_events USING btree ("actionType");


--
-- Name: audit_trail_events_organization_id_created_at; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX audit_trail_events_organization_id_created_at ON public.audit_trail_events USING btree ("organizationId", "createdAt");


--
-- Name: audit_trail_events_organization_id_page_name; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX audit_trail_events_organization_id_page_name ON public.audit_trail_events USING btree ("organizationId", "pageName");


--
-- Name: audit_trail_events_organization_id_query_name; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX audit_trail_events_organization_id_query_name ON public.audit_trail_events USING btree ("organizationId", "queryName");


--
-- Name: audit_trail_events_organization_id_user_id; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX audit_trail_events_organization_id_user_id ON public.audit_trail_events USING btree ("organizationId", "userId");


--
-- Name: bad_passwords_password; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE UNIQUE INDEX bad_passwords_password ON public.bad_passwords USING btree (password);


--
-- Name: block_saves_created_at; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX block_saves_created_at ON public.block_saves USING btree ("createdAt");


--
-- Name: blueprints_appstore_tags_blueprint_id; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX blueprints_appstore_tags_blueprint_id ON public.blueprints_appstore_tags USING btree ("blueprintId");


--
-- Name: blueprints_appstore_tags_tag_id; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX blueprints_appstore_tags_tag_id ON public.blueprints_appstore_tags USING btree ("tagId");


--
-- Name: blueprints_author_id; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX blueprints_author_id ON public.blueprints USING btree ("authorId");


--
-- Name: blueprints_page_id; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX blueprints_page_id ON public.blueprints USING btree ("pageId");


--
-- Name: component_metadata_component_type; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX component_metadata_component_type ON public.component_metadata USING btree ("componentType");


--
-- Name: config_var_values_config_var_uuid; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX config_var_values_config_var_uuid ON public.config_var_values USING btree ("configVarUuid");


--
-- Name: config_var_values_environment_id; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX config_var_values_environment_id ON public.config_var_values USING btree ("environmentId");


--
-- Name: config_vars_organization_id; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX config_vars_organization_id ON public.config_vars USING btree ("organizationId");


--
-- Name: custom_domains_organization_id; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX custom_domains_organization_id ON public.custom_domains USING btree ("organizationId");


--
-- Name: embeds_uuid; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE UNIQUE INDEX embeds_uuid ON public.embeds USING btree (uuid);


--
-- Name: environments_organization_id; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX environments_organization_id ON public.environments USING btree ("organizationId");


--
-- Name: event_workflows_organizationId_eventType_workflowId; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE UNIQUE INDEX "event_workflows_organizationId_eventType_workflowId" ON public.event_workflows USING btree ("organizationId", "eventType", "workflowId");


--
-- Name: event_workflows_workflowId; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX "event_workflows_workflowId" ON public.event_workflows USING btree ("workflowId");


--
-- Name: experiment_strategies_strategy_target_id; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX experiment_strategies_strategy_target_id ON public.experiment_strategies USING btree (strategy, "targetId");


--
-- Name: experiment_strategies_target_id_strategy; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX experiment_strategies_target_id_strategy ON public.experiment_strategies USING btree ("targetId", strategy);


--
-- Name: external_users_organization_id_external_user_id; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE UNIQUE INDEX external_users_organization_id_external_user_id ON public.external_users USING btree ("organizationId", "externalIdentifier");


--
-- Name: folders_organization_id; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX folders_organization_id ON public.folders USING btree ("organizationId");


--
-- Name: folders_parentFolderIdNotNull_organizationId_folderType_name_ke; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE UNIQUE INDEX "folders_parentFolderIdNotNull_organizationId_folderType_name_ke" ON public.folders USING btree ("organizationId", "parentFolderId", "folderType", name) WHERE ("parentFolderId" IS NOT NULL);


--
-- Name: folders_parentFolderIdNull_organizationId_folderType_name_key; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE UNIQUE INDEX "folders_parentFolderIdNull_organizationId_folderType_name_key" ON public.folders USING btree ("organizationId", "folderType", name) WHERE ("parentFolderId" IS NULL);


--
-- Name: form_fields_formId; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX "form_fields_formId" ON public.form_fields USING btree ("formId");


--
-- Name: forms_organizationId; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX "forms_organizationId" ON public.forms USING btree ("organizationId");


--
-- Name: forms_pageId; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX "forms_pageId" ON public.forms USING btree ("pageId");


--
-- Name: grid_field_grid_id_table_field_name; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE UNIQUE INDEX grid_field_grid_id_table_field_name ON public.grid_field USING btree ("gridId", "table", "fieldName");


--
-- Name: gridid_table_name_unique_index; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE UNIQUE INDEX gridid_table_name_unique_index ON public.grid_view USING btree ("gridId", "table", name);


--
-- Name: group_resource_folder_groupId_resourceFolderId_key; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE UNIQUE INDEX "group_resource_folder_groupId_resourceFolderId_key" ON public.group_resource_folder_defaults USING btree ("groupId", "resourceFolderId");


--
-- Name: group_resources_resourceIdForEnv; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX "group_resources_resourceIdForEnv" ON public.group_resources USING btree ("resourceIdForEnv");


--
-- Name: group_resources_resource_name; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX group_resources_resource_name ON public.group_resources USING btree ("resourceName");


--
-- Name: group_workflows_workflowId; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX "group_workflows_workflowId" ON public.group_workflows USING btree ("workflowId");


--
-- Name: iam_credentials_organization_id; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX iam_credentials_organization_id ON public.iam_credentials USING btree ("organizationId");


--
-- Name: instrumentation_integrations_organization_id_integration; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE UNIQUE INDEX instrumentation_integrations_organization_id_integration ON public.instrumentation_integrations USING btree (organization_id, integration);


--
-- Name: language_configuration_aliasFor_language; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX "language_configuration_aliasFor_language" ON public.language_configuration USING btree ("aliasFor", language);


--
-- Name: language_configuration_languageConfigurationId; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX "language_configuration_languageConfigurationId" ON public.language_configuration_save USING btree ("languageConfigurationId");


--
-- Name: language_configuration_libraries; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX language_configuration_libraries ON public.language_configuration USING gin (libraries);


--
-- Name: language_configuration_organizationId_name; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE UNIQUE INDEX "language_configuration_organizationId_name" ON public.language_configuration USING btree ("organizationId", name);


--
-- Name: notification_applications_bundle_id_platform; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE UNIQUE INDEX notification_applications_bundle_id_platform ON public.notification_applications USING btree ("bundleId", platform);


--
-- Name: notification_applications_created_by; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX notification_applications_created_by ON public.notification_applications USING btree ("createdBy");


--
-- Name: notification_applications_organization_id; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX notification_applications_organization_id ON public.notification_applications USING btree ("organizationId");


--
-- Name: notification_subscribed_devices_device_id; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE UNIQUE INDEX notification_subscribed_devices_device_id ON public.notification_subscribed_devices USING btree ("deviceId");


--
-- Name: notification_subscribed_devices_user_id_device_id_transport_typ; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE UNIQUE INDEX notification_subscribed_devices_user_id_device_id_transport_typ ON public.notification_subscribed_devices USING btree ("userId", "deviceId", "transportType");


--
-- Name: notification_topic_subscriptions_organization_id_user_id_page_i; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE UNIQUE INDEX notification_topic_subscriptions_organization_id_user_id_page_i ON public.notification_topic_subscriptions USING btree ("organizationId", "userId", "pageId", "topicName");


--
-- Name: notification_topic_subscriptions_page_id; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX notification_topic_subscriptions_page_id ON public.notification_topic_subscriptions USING btree ("pageId");


--
-- Name: notification_topic_subscriptions_user_id; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX notification_topic_subscriptions_user_id ON public.notification_topic_subscriptions USING btree ("userId");


--
-- Name: organization_email_domains_org_domain_uniq; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE UNIQUE INDEX organization_email_domains_org_domain_uniq ON public.organization_email_domains USING btree ("organizationId", "emailDomain");


--
-- Name: organization_user_attributes_organization_id; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX organization_user_attributes_organization_id ON public.organization_user_attributes USING btree ("organizationId");


--
-- Name: organizations_parent_org_id; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX organizations_parent_org_id ON public.organizations USING btree ("parentOrgId");


--
-- Name: page_save_playground_query_saves_playground_query_id; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX page_save_playground_query_saves_playground_query_id ON public.page_save_playground_query_saves USING btree ("playgroundQueryId");


--
-- Name: page_save_playground_query_saves_playground_query_save_id; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX page_save_playground_query_saves_playground_query_save_id ON public.page_save_playground_query_saves USING btree ("playgroundQuerySaveId");


--
-- Name: page_saves_page_id_id; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX page_saves_page_id_id ON public.page_saves USING btree ("pageId", id DESC);


--
-- Name: pages_folderId_organizationId_name_deletedAt_key; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE UNIQUE INDEX "pages_folderId_organizationId_name_deletedAt_key" ON public.pages USING btree ("folderId", "organizationId", name, "deletedAt") WHERE ("deletedAt" IS NOT NULL);


--
-- Name: pages_folderId_organizationId_name_key; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE UNIQUE INDEX "pages_folderId_organizationId_name_key" ON public.pages USING btree ("folderId", "organizationId", name) WHERE ("deletedAt" IS NULL);


--
-- Name: pages_folderid; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX pages_folderid ON public.pages USING btree ("folderId");


--
-- Name: pages_organization_id_deleted_at; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX pages_organization_id_deleted_at ON public.pages USING btree ("organizationId", "deletedAt");


--
-- Name: pages_organization_id_shortlink; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE UNIQUE INDEX pages_organization_id_shortlink ON public.pages USING btree ("organizationId", shortlink);


--
-- Name: pages_releasedtagid; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX pages_releasedtagid ON public.pages USING btree ("releasedTagId");


--
-- Name: pending_user_invites_idx; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE UNIQUE INDEX pending_user_invites_idx ON public.user_invite_suggestions USING btree ("organizationId", "suggestedEmail") WHERE ((status = 'PENDING'::public.enum_user_invite_suggestions_status) OR (status = 'APPROVED'::public.enum_user_invite_suggestions_status));


--
-- Name: personal_access_tokens_organization_id_user_id; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX personal_access_tokens_organization_id_user_id ON public.personal_access_tokens USING btree ("organizationId", "userId");


--
-- Name: plaground_query_saves_playgroundQueryUuid; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX "plaground_query_saves_playgroundQueryUuid" ON public.playground_query_saves USING btree ("playgroundQueryUuid");


--
-- Name: playground_query_saves_playground_query_id_id; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX playground_query_saves_playground_query_id_id ON public.playground_query_saves USING btree ("playgroundQueryId", id);


--
-- Name: playground_query_saves_resource_uuid; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX playground_query_saves_resource_uuid ON public.playground_query_saves USING btree ("resourceUuid");


--
-- Name: recently_visited_apps_user_id; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX recently_visited_apps_user_id ON public.recently_visited_apps USING btree ("userId");


--
-- Name: resourceFolders_parentFolderIdNotNull_organizationId_name_key; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE UNIQUE INDEX "resourceFolders_parentFolderIdNotNull_organizationId_name_key" ON public.resource_folders USING btree ("parentFolderId", "organizationId", name) WHERE ("parentFolderId" IS NOT NULL);


--
-- Name: resourceFolders_parentFolderIdNull_organizationId_name_key; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE UNIQUE INDEX "resourceFolders_parentFolderIdNull_organizationId_name_key" ON public.resource_folders USING btree ("organizationId", name) WHERE ("parentFolderId" IS NULL);


--
-- Name: resource_folders_organization_id; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX resource_folders_organization_id ON public.resource_folders USING btree ("organizationId");


--
-- Name: resources_name; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX resources_name ON public.resources USING btree (name) WHERE (name IS NOT NULL);


--
-- Name: retool_db_provision_organization_id; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX retool_db_provision_organization_id ON public.retool_db_provision USING btree ("organizationId");


--
-- Name: retool_db_provision_resource_id; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX retool_db_provision_resource_id ON public.retool_db_provision USING btree ("resourceId");


--
-- Name: retool_db_provision_status; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX retool_db_provision_status ON public.retool_db_provision USING btree (status);


--
-- Name: retool_files_created_by; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX retool_files_created_by ON public.retool_files USING btree ("createdBy");


--
-- Name: retool_files_organization_id_file_id; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX retool_files_organization_id_file_id ON public.retool_files USING btree ("organizationId", "fileId");


--
-- Name: retool_files_updated_by; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX retool_files_updated_by ON public.retool_files USING btree ("updatedBy");


--
-- Name: retool_managed_note_comment_retool_managed_note_id; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX retool_managed_note_comment_retool_managed_note_id ON public.retool_managed_note_comment USING btree ("retoolManagedNoteId");


--
-- Name: retool_rules_organization_id; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX retool_rules_organization_id ON public.retool_rules USING btree ("organizationId");


--
-- Name: role_pages_members_role_id_organization_id_user_invite_id; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE UNIQUE INDEX role_pages_members_role_id_organization_id_user_invite_id ON public.role_pages_members USING btree ("roleId", "organizationId", "userInviteId");


--
-- Name: role_pages_organization_id_page_id_access_type; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE UNIQUE INDEX role_pages_organization_id_page_id_access_type ON public.role_pages USING btree ("organizationId", "pageId", "accessType");


--
-- Name: sessions_access_token; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX sessions_access_token ON public.sessions USING btree ("accessToken");


--
-- Name: sessions_userId; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX "sessions_userId" ON public.sessions USING btree ("userId");


--
-- Name: source_control_protection_status_organization_id_element_uuid; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX source_control_protection_status_organization_id_element_uuid ON public.source_control_protection_status USING btree ("organizationId", "elementUuid");


--
-- Name: source_control_protection_status_organization_id_protection_bra; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX source_control_protection_status_organization_id_protection_bra ON public.source_control_protection_status USING btree ("organizationId", "protectionBranchName", status);


--
-- Name: source_control_relationships_branch_id; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX source_control_relationships_branch_id ON public.source_control_relationships USING btree ("branchId");


--
-- Name: source_control_relationships_element_uuid_branch_id; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX source_control_relationships_element_uuid_branch_id ON public.source_control_relationships USING btree ("elementUuid", "branchId");


--
-- Name: source_control_relationships_organization_id_element_uuid; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX source_control_relationships_organization_id_element_uuid ON public.source_control_relationships USING btree ("organizationId", "elementUuid");


--
-- Name: source_control_repo_migration_logs_migrationId; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX "source_control_repo_migration_logs_migrationId" ON public.source_control_repo_migration_logs USING btree ("migrationId");


--
-- Name: source_control_repo_migration_logs_org_migration_branch; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX source_control_repo_migration_logs_org_migration_branch ON public.source_control_repo_migration_logs USING btree ("organizationId", "migrationId", "branchName");


--
-- Name: source_control_repo_migration_logs_organizationId; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX "source_control_repo_migration_logs_organizationId" ON public.source_control_repo_migration_logs USING btree ("organizationId");


--
-- Name: source_control_repo_migration_organizationId; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX "source_control_repo_migration_organizationId" ON public.source_control_repo_migrations USING btree ("organizationId");


--
-- Name: source_control_repo_migration_organizationId_toVersion_status; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX "source_control_repo_migration_organizationId_toVersion_status" ON public.source_control_repo_migrations USING btree ("organizationId", "toVersion", status);


--
-- Name: source_control_repo_migration_triggeredBy; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX "source_control_repo_migration_triggeredBy" ON public.source_control_repo_migrations USING btree ("triggeredBy");


--
-- Name: source_control_user_info_user_id_organization_id; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX source_control_user_info_user_id_organization_id ON public.source_control_user_info USING btree ("userId", "organizationId");


--
-- Name: source_control_uuid_mappings_global_uuid_organization_id; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX source_control_uuid_mappings_global_uuid_organization_id ON public.source_control_uuid_mappings USING btree ("globalUuid", "organizationId");


--
-- Name: ssh_keys_organization_id; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX ssh_keys_organization_id ON public.ssh_keys USING btree ("organizationId");


--
-- Name: storage_blobs_organization_id_mimetype; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX storage_blobs_organization_id_mimetype ON public.storage_blobs USING btree ("organizationId", mimetype);


--
-- Name: tags_page_id; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX tags_page_id ON public.tags USING btree ("pageId");


--
-- Name: tags_page_save_id; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX tags_page_save_id ON public.tags USING btree ("pageSaveId");


--
-- Name: temporal_cloud_settings_organizationId; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE UNIQUE INDEX "temporal_cloud_settings_organizationId" ON public.temporal_cloud_settings USING btree ("organizationId");


--
-- Name: temporal_cloud_tls_configs_organizationId; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX "temporal_cloud_tls_configs_organizationId" ON public.temporal_cloud_tls_configs USING btree ("organizationId");


--
-- Name: tpu_pkey_globalwidgetonly; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX tpu_pkey_globalwidgetonly ON public.tracked_property_usages USING btree (id) WHERE (("propertyType")::text = 'globalWidget'::text);


--
-- Name: tpu_propertyidentifier_pageid_globalwidgetonly; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX tpu_propertyidentifier_pageid_globalwidgetonly ON public.tracked_property_usages USING btree ("propertyIdentifier", "pageId") WHERE (("propertyType")::text = 'globalWidget'::text);


--
-- Name: tracked_property_usages_page_id; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX tracked_property_usages_page_id ON public.tracked_property_usages USING btree ("pageId");


--
-- Name: unique_partial_environments_organization_id_is_default; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE UNIQUE INDEX unique_partial_environments_organization_id_is_default ON public.environments USING btree ("organizationId", "isDefault") WHERE ("isDefault" = true);


--
-- Name: unique_partial_workflow_release_name_workflow_id; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE UNIQUE INDEX unique_partial_workflow_release_name_workflow_id ON public.workflow_release USING btree (name, "workflowId") WHERE (name IS NOT NULL);


--
-- Name: userId_ipAddress; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX "userId_ipAddress" ON public.user_login_ip_addresses USING btree ("userId", "ipAddress");


--
-- Name: user_groups_groupId; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX "user_groups_groupId" ON public.user_groups USING btree ("groupId");


--
-- Name: user_groups_user_id; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX user_groups_user_id ON public.user_groups USING btree ("userId");


--
-- Name: user_invites_email; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX user_invites_email ON public.user_invites USING btree (email);


--
-- Name: user_invites_organization_id; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX user_invites_organization_id ON public.user_invites USING btree ("organizationId");


--
-- Name: user_viewed_features_user_id_feature_key; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX user_viewed_features_user_id_feature_key ON public.user_viewed_features USING btree ("userId", "featureKey");


--
-- Name: users_organization_id; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX users_organization_id ON public.users USING btree ("organizationId");


--
-- Name: vectors_organization_id; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX vectors_organization_id ON public.vectors USING btree ("organizationId");


--
-- Name: vectors_organization_id_namespace; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE UNIQUE INDEX vectors_organization_id_namespace ON public.vectors USING btree ("organizationId", namespace);


--
-- Name: vscode_sessions_created_at_orgId; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX "vscode_sessions_created_at_orgId" ON public.vscode_sessions USING btree ("createdAt", "organizationId");


--
-- Name: vscode_sessions_orgId_userEmail_createdAt; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX "vscode_sessions_orgId_userEmail_createdAt" ON public.vscode_sessions USING btree ("organizationId", "userEmail", "createdAt");


--
-- Name: vscode_sessions_organizationId; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX "vscode_sessions_organizationId" ON public.vscode_sessions USING btree ("organizationId");


--
-- Name: vscode_types_orgId_app_uuid_createdAt; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX "vscode_types_orgId_app_uuid_createdAt" ON public.vscode_types USING btree ("organizationId", "appUuid", "createdAt");


--
-- Name: vscode_types_org_id_created_at; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX vscode_types_org_id_created_at ON public.vscode_types USING btree ("organizationId", "createdAt");


--
-- Name: vscode_types_organizationId; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX "vscode_types_organizationId" ON public.vscode_types USING btree ("organizationId");


--
-- Name: workflow_aggregate_usage_organization_id_period_end_period_star; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX workflow_aggregate_usage_organization_id_period_end_period_star ON public.workflow_aggregate_usage USING btree ("organizationId", "periodEnd" DESC, "periodStart");


--
-- Name: workflow_aggregate_usage_workflowId; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX "workflow_aggregate_usage_workflowId" ON public.workflow_aggregate_usage USING btree ("workflowId");


--
-- Name: workflow_block_results_dataExpiresAt; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX "workflow_block_results_dataExpiresAt" ON public.workflow_block_results USING btree ("dataExpiresAt");


--
-- Name: workflow_block_runs_workflowId; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX "workflow_block_runs_workflowId" ON public.workflow_block_runs USING btree ("workflowId");


--
-- Name: workflow_block_runs_workflowRunId_blockPluginId; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE UNIQUE INDEX "workflow_block_runs_workflowRunId_blockPluginId" ON public.workflow_block_runs USING btree ("workflowRunId", "blockPluginId");


--
-- Name: workflow_folder_id_organization_id_name; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX workflow_folder_id_organization_id_name ON public.workflow USING btree ("folderId", "organizationId", name);


--
-- Name: workflow_folderid; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX workflow_folderid ON public.workflow USING btree ("folderId");


--
-- Name: workflow_organization_id; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX workflow_organization_id ON public.workflow USING btree ("organizationId");


--
-- Name: workflow_releaseId; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX "workflow_releaseId" ON public.workflow USING btree ("releaseId");


--
-- Name: workflow_release_workflowId; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX "workflow_release_workflowId" ON public.workflow_release USING btree ("workflowId");


--
-- Name: workflow_release_workflowSaveId; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX "workflow_release_workflowSaveId" ON public.workflow_release USING btree ("workflowSaveId");


--
-- Name: workflow_releaseid; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX workflow_releaseid ON public.workflow USING btree ("releaseId");


--
-- Name: workflow_run_environmentId; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX "workflow_run_environmentId" ON public.workflow_run USING btree ("environmentId");


--
-- Name: workflow_run_logs_runId_pluginId_numRetry_sequenceToken; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX "workflow_run_logs_runId_pluginId_numRetry_sequenceToken" ON public.workflow_run_logs USING btree ("workflowRunId", "blockPluginId", "numRetry", "sequenceToken");


--
-- Name: workflow_run_logs_workflowId; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX "workflow_run_logs_workflowId" ON public.workflow_run_logs USING btree ("workflowId");


--
-- Name: workflow_run_not_complete; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX workflow_run_not_complete ON public.workflow_run USING btree ("createdAt") WHERE (((status)::text = 'PENDING'::text) OR ((status)::text = 'IN_PROGRESS'::text));


--
-- Name: workflow_run_triggerid; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX workflow_run_triggerid ON public.workflow_run USING btree ("triggerId");


--
-- Name: workflow_run_workflowId_completedAt_index; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX "workflow_run_workflowId_completedAt_index" ON public.workflow_run USING btree ("workflowId", "completedAt");


--
-- Name: workflow_run_workflowId_createdAt_index; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX "workflow_run_workflowId_createdAt_index" ON public.workflow_run USING btree ("workflowId", "createdAt");


--
-- Name: workflow_run_workflowId_status_createdAt; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX "workflow_run_workflowId_status_createdAt" ON public.workflow_run USING btree ("workflowId", status, "createdAt");


--
-- Name: workflow_run_workflowSaveId; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX "workflow_run_workflowSaveId" ON public.workflow_run USING btree ("workflowSaveId");


--
-- Name: workflow_runs_to_cleanup_index; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX workflow_runs_to_cleanup_index ON public.workflow_run USING btree ("workflowId", "completedAt") WHERE (("completedAt" IS NOT NULL) AND ("blobDataDeletedAt" IS NULL));


--
-- Name: workflow_save_createdBy; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX "workflow_save_createdBy" ON public.workflow_save USING btree ("createdBy");


--
-- Name: workflow_save_javascriptLanguageConfigurationSaveId; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX "workflow_save_javascriptLanguageConfigurationSaveId" ON public.workflow_save USING btree ("javascriptLanguageConfigurationSaveId");


--
-- Name: workflow_save_pythonLanguageConfigurationSaveId; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX "workflow_save_pythonLanguageConfigurationSaveId" ON public.workflow_save USING btree ("pythonLanguageConfigurationSaveId");


--
-- Name: workflow_save_workflow_id; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX workflow_save_workflow_id ON public.workflow_save USING btree ("workflowId");


--
-- Name: workflow_save_workflow_id_created_at_index; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX workflow_save_workflow_id_created_at_index ON public.workflow_save USING btree ("workflowId", "createdAt" DESC);


--
-- Name: workflow_tracked_property_usages_workflow_id; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX workflow_tracked_property_usages_workflow_id ON public.workflow_tracked_property_usages USING btree ("workflowId");


--
-- Name: workflow_trigger_workflow_id; Type: INDEX; Schema: public; Owner: retool_internal_user
--

CREATE INDEX workflow_trigger_workflow_id ON public.workflow_trigger USING btree ("workflowId");


--
-- Name: environments exactly_one_default_environment_exists_before_delete_trigger; Type: TRIGGER; Schema: public; Owner: retool_internal_user
--

CREATE TRIGGER exactly_one_default_environment_exists_before_delete_trigger BEFORE DELETE ON public.environments FOR EACH ROW EXECUTE PROCEDURE public.exactly_one_default_environment_exists_before_delete();


--
-- Name: audit_trail_events update_users_last_active_trigger; Type: TRIGGER; Schema: public; Owner: retool_internal_user
--

CREATE TRIGGER update_users_last_active_trigger AFTER INSERT ON public.audit_trail_events FOR EACH ROW EXECUTE PROCEDURE public.update_users_last_active_trigger();

ALTER TABLE public.audit_trail_events DISABLE TRIGGER update_users_last_active_trigger;


--
-- Name: group_pages validate_group_pages_trigger; Type: TRIGGER; Schema: public; Owner: retool_internal_user
--

CREATE TRIGGER validate_group_pages_trigger BEFORE INSERT OR UPDATE ON public.group_pages FOR EACH ROW EXECUTE PROCEDURE public.validate_group_pages_trigger();


--
-- Name: group_resources validate_group_resources_trigger; Type: TRIGGER; Schema: public; Owner: retool_internal_user
--

CREATE TRIGGER validate_group_resources_trigger BEFORE INSERT OR UPDATE ON public.group_resources FOR EACH ROW EXECUTE PROCEDURE public.validate_group_resources_trigger();


--
-- Name: group_workflows validate_group_workflows_trigger; Type: TRIGGER; Schema: public; Owner: retool_internal_user
--

CREATE TRIGGER validate_group_workflows_trigger BEFORE INSERT OR UPDATE ON public.group_workflows FOR EACH ROW EXECUTE PROCEDURE public.validate_group_workflows_trigger();


--
-- Name: pages validate_pages_releasedtagid_trigger; Type: TRIGGER; Schema: public; Owner: retool_internal_user
--

CREATE TRIGGER validate_pages_releasedtagid_trigger BEFORE INSERT OR UPDATE ON public.pages FOR EACH ROW EXECUTE PROCEDURE public.validate_pages_releasedtagid();


--
-- Name: workflow_release validate_release_workflowid_trigger; Type: TRIGGER; Schema: public; Owner: retool_internal_user
--

CREATE TRIGGER validate_release_workflowid_trigger BEFORE INSERT OR UPDATE ON public.workflow_release FOR EACH ROW EXECUTE PROCEDURE public.validate_release_workflowid();


--
-- Name: tags validate_tags_pageid_trigger; Type: TRIGGER; Schema: public; Owner: retool_internal_user
--

CREATE TRIGGER validate_tags_pageid_trigger BEFORE INSERT OR UPDATE ON public.tags FOR EACH ROW EXECUTE PROCEDURE public.validate_tags_pageid();


--
-- Name: user_groups validate_user_groups_trigger; Type: TRIGGER; Schema: public; Owner: retool_internal_user
--

CREATE TRIGGER validate_user_groups_trigger BEFORE INSERT OR UPDATE ON public.user_groups FOR EACH ROW EXECUTE PROCEDURE public.validate_user_groups_trigger();


--
-- Name: user_invite_groups validate_user_invite_groups_trigger; Type: TRIGGER; Schema: public; Owner: retool_internal_user
--

CREATE TRIGGER validate_user_invite_groups_trigger BEFORE INSERT OR UPDATE ON public.user_invite_groups FOR EACH ROW EXECUTE PROCEDURE public.validate_user_invite_groups_trigger();


--
-- Name: workflow validate_workflow_releaseid_trigger; Type: TRIGGER; Schema: public; Owner: retool_internal_user
--

CREATE TRIGGER validate_workflow_releaseid_trigger BEFORE INSERT OR UPDATE ON public.workflow FOR EACH ROW EXECUTE PROCEDURE public.validate_workflow_releaseid();


--
-- Name: access_control_list_members access_control_list_members_aclId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.access_control_list_members
    ADD CONSTRAINT "access_control_list_members_aclId_fkey" FOREIGN KEY ("aclId") REFERENCES public.access_control_lists(id) ON DELETE CASCADE;


--
-- Name: access_control_list_members access_control_list_members_addedByUser_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.access_control_list_members
    ADD CONSTRAINT "access_control_list_members_addedByUser_fkey" FOREIGN KEY ("addedByUser") REFERENCES public.users(id);


--
-- Name: access_control_lists access_control_lists_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.access_control_lists
    ADD CONSTRAINT "access_control_lists_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: api_keys api_keys_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT "api_keys_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: app_metadata app_metadata_pageId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.app_metadata
    ADD CONSTRAINT "app_metadata_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES public.pages(id);


--
-- Name: app_metadata app_metadata_pageSaveId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.app_metadata
    ADD CONSTRAINT "app_metadata_pageSaveId_fkey" FOREIGN KEY ("pageSaveId") REFERENCES public.page_saves(id);


--
-- Name: app_themes app_themes_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.app_themes
    ADD CONSTRAINT app_themes_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: approval_task_executions approval_task_executions_approvalTaskUuid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.approval_task_executions
    ADD CONSTRAINT "approval_task_executions_approvalTaskUuid_fkey" FOREIGN KEY ("approvalTaskUuid") REFERENCES public.approval_task_items(uuid);


--
-- Name: approval_task_items approval_task_items_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.approval_task_items
    ADD CONSTRAINT "approval_task_items_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public.users(id);


--
-- Name: approval_task_items approval_task_items_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.approval_task_items
    ADD CONSTRAINT "approval_task_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id);


--
-- Name: approval_task_votes approval_task_votes_approvalTaskUuid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.approval_task_votes
    ADD CONSTRAINT "approval_task_votes_approvalTaskUuid_fkey" FOREIGN KEY ("approvalTaskUuid") REFERENCES public.approval_task_items(uuid) ON DELETE CASCADE;


--
-- Name: approval_task_votes approval_task_votes_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.approval_task_votes
    ADD CONSTRAINT "approval_task_votes_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id);


--
-- Name: audit_trail_events audit_trail_events_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.audit_trail_events
    ADD CONSTRAINT "audit_trail_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: audit_trail_events audit_trail_events_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.audit_trail_events
    ADD CONSTRAINT "audit_trail_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: block_saves block_saves_blockId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.block_saves
    ADD CONSTRAINT "block_saves_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES public.blocks(id) ON DELETE CASCADE;


--
-- Name: blocks blocks_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.blocks
    ADD CONSTRAINT "blocks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: blueprints_appstore_tags blueprints_appstore_tags_blueprintId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.blueprints_appstore_tags
    ADD CONSTRAINT "blueprints_appstore_tags_blueprintId_fkey" FOREIGN KEY ("blueprintId") REFERENCES public.blueprints(uuid) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: blueprints_appstore_tags blueprints_appstore_tags_tagId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.blueprints_appstore_tags
    ADD CONSTRAINT "blueprints_appstore_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES public.appstore_tags(uuid) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: blueprints blueprints_authorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.blueprints
    ADD CONSTRAINT "blueprints_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: blueprints blueprints_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.blueprints
    ADD CONSTRAINT "blueprints_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE SET NULL;


--
-- Name: blueprints blueprints_pageId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.blueprints
    ADD CONSTRAINT "blueprints_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES public.pages(id) ON DELETE SET NULL;


--
-- Name: branches branches_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT "branches_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: branches branches_ownerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT "branches_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: branches branches_pageSaveId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT "branches_pageSaveId_fkey" FOREIGN KEY ("pageSaveId") REFERENCES public.page_saves(id) ON DELETE SET NULL;


--
-- Name: commits commits_authorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.commits
    ADD CONSTRAINT "commits_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: commits commits_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.commits
    ADD CONSTRAINT "commits_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: commits commits_pageSaveId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.commits
    ADD CONSTRAINT "commits_pageSaveId_fkey" FOREIGN KEY ("pageSaveId") REFERENCES public.page_saves(id) ON DELETE CASCADE;


--
-- Name: component_metadata component_metadata_appMetadataId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.component_metadata
    ADD CONSTRAINT "component_metadata_appMetadataId_fkey" FOREIGN KEY ("appMetadataId") REFERENCES public.app_metadata(id);


--
-- Name: config_var_values config_var_values_configVarUuid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.config_var_values
    ADD CONSTRAINT "config_var_values_configVarUuid_fkey" FOREIGN KEY ("configVarUuid") REFERENCES public.config_vars(uuid) ON DELETE CASCADE;


--
-- Name: config_var_values config_var_values_environmentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.config_var_values
    ADD CONSTRAINT "config_var_values_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES public.environments(id) ON DELETE CASCADE;


--
-- Name: config_vars config_vars_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.config_vars
    ADD CONSTRAINT "config_vars_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: custom_component_collection_revision_files custom_component_collection_r_customComponentCollectionRev_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.custom_component_collection_revision_files
    ADD CONSTRAINT "custom_component_collection_r_customComponentCollectionRev_fkey" FOREIGN KEY ("customComponentCollectionRevisionId") REFERENCES public.custom_component_collection_revisions(id);


--
-- Name: custom_component_collection_revisions custom_component_collection_re_customComponentCollectionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.custom_component_collection_revisions
    ADD CONSTRAINT "custom_component_collection_re_customComponentCollectionId_fkey" FOREIGN KEY ("customComponentCollectionId") REFERENCES public.custom_component_collections(id);


--
-- Name: custom_component_collections custom_component_collections_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.custom_component_collections
    ADD CONSTRAINT "custom_component_collections_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id);


--
-- Name: custom_domains custom_domains_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.custom_domains
    ADD CONSTRAINT "custom_domains_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE SET NULL;


--
-- Name: dg_activity dg_activity_actorUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.dg_activity
    ADD CONSTRAINT "dg_activity_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: dg_activity dg_activity_bulkEditId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.dg_activity
    ADD CONSTRAINT "dg_activity_bulkEditId_fkey" FOREIGN KEY ("bulkEditId") REFERENCES public.dg_bulk_edit(id) ON DELETE CASCADE;


--
-- Name: dg_activity dg_activity_gridId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.dg_activity
    ADD CONSTRAINT "dg_activity_gridId_fkey" FOREIGN KEY ("gridId") REFERENCES public.dg_grid(id) ON DELETE CASCADE;


--
-- Name: dg_activity dg_activity_singleEditId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.dg_activity
    ADD CONSTRAINT "dg_activity_singleEditId_fkey" FOREIGN KEY ("singleEditId") REFERENCES public.dg_single_edit(id) ON DELETE CASCADE;


--
-- Name: dg_bulk_edit dg_bulk_edit_createdByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.dg_bulk_edit
    ADD CONSTRAINT "dg_bulk_edit_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: dg_bulk_edit dg_bulk_edit_executedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.dg_bulk_edit
    ADD CONSTRAINT "dg_bulk_edit_executedByUserId_fkey" FOREIGN KEY ("executedByUserId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: dg_bulk_edit dg_bulk_edit_gridId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.dg_bulk_edit
    ADD CONSTRAINT "dg_bulk_edit_gridId_fkey" FOREIGN KEY ("gridId") REFERENCES public.dg_grid(id) ON DELETE CASCADE;


--
-- Name: dg_grid dg_grid_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.dg_grid
    ADD CONSTRAINT "dg_grid_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: dg_grid dg_grid_resourceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.dg_grid
    ADD CONSTRAINT "dg_grid_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES public.resources(id) ON DELETE CASCADE;


--
-- Name: dg_single_edit dg_single_edit_bulkEditId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.dg_single_edit
    ADD CONSTRAINT "dg_single_edit_bulkEditId_fkey" FOREIGN KEY ("bulkEditId") REFERENCES public.dg_bulk_edit(id) ON DELETE CASCADE;


--
-- Name: dg_single_edit dg_single_edit_gridId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.dg_single_edit
    ADD CONSTRAINT "dg_single_edit_gridId_fkey" FOREIGN KEY ("gridId") REFERENCES public.dg_grid(id) ON DELETE CASCADE;


--
-- Name: embeds embeds_page_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.embeds
    ADD CONSTRAINT embeds_page_id_fkey FOREIGN KEY ("pageId") REFERENCES public.pages(id) ON DELETE CASCADE;


--
-- Name: environment_config_vars environment_config_vars_environmentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.environment_config_vars
    ADD CONSTRAINT "environment_config_vars_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES public.environments(id) ON DELETE CASCADE;


--
-- Name: environments environments_authorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.environments
    ADD CONSTRAINT "environments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: environments environments_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.environments
    ADD CONSTRAINT "environments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: event_workflows event_workflows_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.event_workflows
    ADD CONSTRAINT "event_workflows_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: event_workflows event_workflows_workflowId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.event_workflows
    ADD CONSTRAINT "event_workflows_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES public.workflow(id) ON DELETE CASCADE;


--
-- Name: experiment_audiences experiment_audiences_experimentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.experiment_audiences
    ADD CONSTRAINT "experiment_audiences_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES public.experiments(id) ON DELETE CASCADE;


--
-- Name: experiment_audiences experiment_audiences_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.experiment_audiences
    ADD CONSTRAINT "experiment_audiences_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: experiment_audiences experiment_audiences_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.experiment_audiences
    ADD CONSTRAINT "experiment_audiences_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: experiment_strategies experiment_strategies_experimentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.experiment_strategies
    ADD CONSTRAINT "experiment_strategies_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES public.experiments(id) ON DELETE CASCADE;


--
-- Name: external_embed_sessions external_embed_sessions_externalUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.external_embed_sessions
    ADD CONSTRAINT "external_embed_sessions_externalUserId_fkey" FOREIGN KEY ("externalUserId") REFERENCES public.external_users(id) ON DELETE CASCADE;


--
-- Name: external_embed_sessions external_embed_sessions_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.external_embed_sessions
    ADD CONSTRAINT "external_embed_sessions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: external_embed_sessions external_embed_sessions_pageUuid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.external_embed_sessions
    ADD CONSTRAINT "external_embed_sessions_pageUuid_fkey" FOREIGN KEY ("pageUuid") REFERENCES public.pages(uuid) ON DELETE CASCADE;


--
-- Name: external_embed_sessions external_embed_sessions_personalAccessTokenId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.external_embed_sessions
    ADD CONSTRAINT "external_embed_sessions_personalAccessTokenId_fkey" FOREIGN KEY ("personalAccessTokenId") REFERENCES public.personal_access_tokens(id) ON DELETE CASCADE;


--
-- Name: external_embed_sessions external_embed_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.external_embed_sessions
    ADD CONSTRAINT external_embed_sessions_user_id_fkey FOREIGN KEY ("userId") REFERENCES public.users(id);


--
-- Name: external_users external_users_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.external_users
    ADD CONSTRAINT "external_users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: workflow_block_results fk_workflow_block_results_compressionScheme; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.workflow_block_results
    ADD CONSTRAINT "fk_workflow_block_results_compressionScheme" FOREIGN KEY ("compressionScheme") REFERENCES public.workflow_compression_scheme_enum(id);


--
-- Name: workflow_block_runs fk_workflow_block_runs_blockResultLocation; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.workflow_block_runs
    ADD CONSTRAINT "fk_workflow_block_runs_blockResultLocation" FOREIGN KEY ("blockResultLocation") REFERENCES public.workflow_block_result_location_enum(id);


--
-- Name: workflow_run_logs fk_workflow_run_logs_compressionScheme; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.workflow_run_logs
    ADD CONSTRAINT "fk_workflow_run_logs_compressionScheme" FOREIGN KEY ("compressionScheme") REFERENCES public.workflow_compression_scheme_enum(id);


--
-- Name: flow_input_schemas flow_input_schemas_flowId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.flow_input_schemas
    ADD CONSTRAINT "flow_input_schemas_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES public.flows(id) ON DELETE CASCADE;


--
-- Name: flow_queries flow_queries_flowStageId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.flow_queries
    ADD CONSTRAINT "flow_queries_flowStageId_fkey" FOREIGN KEY ("flowStageId") REFERENCES public.flow_stages(id) ON DELETE CASCADE;


--
-- Name: flow_queries flow_queries_playgroundQuerySaveId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.flow_queries
    ADD CONSTRAINT "flow_queries_playgroundQuerySaveId_fkey" FOREIGN KEY ("playgroundQuerySaveId") REFERENCES public.playground_query_saves(id) ON DELETE CASCADE;


--
-- Name: flow_stages flow_stages_flowId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.flow_stages
    ADD CONSTRAINT "flow_stages_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES public.flows(id) ON DELETE CASCADE;


--
-- Name: flow_task_histories flow_task_histories_flowId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.flow_task_histories
    ADD CONSTRAINT "flow_task_histories_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES public.flows(id) ON DELETE CASCADE;


--
-- Name: flow_task_histories flow_task_histories_flowStageId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.flow_task_histories
    ADD CONSTRAINT "flow_task_histories_flowStageId_fkey" FOREIGN KEY ("flowStageId") REFERENCES public.flow_stages(id) ON DELETE SET NULL;


--
-- Name: flow_task_histories flow_task_histories_taskId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.flow_task_histories
    ADD CONSTRAINT "flow_task_histories_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES public.flow_tasks(id) ON DELETE SET NULL;


--
-- Name: flow_task_inputs flow_task_inputs_flowInputSchemaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.flow_task_inputs
    ADD CONSTRAINT "flow_task_inputs_flowInputSchemaId_fkey" FOREIGN KEY ("flowInputSchemaId") REFERENCES public.flow_input_schemas(id) ON DELETE CASCADE;


--
-- Name: flow_task_inputs flow_task_inputs_taskId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.flow_task_inputs
    ADD CONSTRAINT "flow_task_inputs_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES public.flow_tasks(id) ON DELETE CASCADE;


--
-- Name: flow_tasks flow_tasks_flowId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.flow_tasks
    ADD CONSTRAINT "flow_tasks_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES public.flows(id) ON DELETE CASCADE;


--
-- Name: flow_tasks flow_tasks_flowStageId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.flow_tasks
    ADD CONSTRAINT "flow_tasks_flowStageId_fkey" FOREIGN KEY ("flowStageId") REFERENCES public.flow_stages(id) ON DELETE CASCADE;


--
-- Name: flow_tasks flow_tasks_ownerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.flow_tasks
    ADD CONSTRAINT "flow_tasks_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: flows flows_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.flows
    ADD CONSTRAINT "flows_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: flows flows_ownerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.flows
    ADD CONSTRAINT "flows_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: folder_favorites folder_favorites_folderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.folder_favorites
    ADD CONSTRAINT "folder_favorites_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES public.folders(id) ON DELETE CASCADE;


--
-- Name: folder_favorites folder_favorites_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.folder_favorites
    ADD CONSTRAINT "folder_favorites_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: folders folders_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.folders
    ADD CONSTRAINT "folders_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: folders folders_parentFolderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.folders
    ADD CONSTRAINT "folders_parentFolderId_fkey" FOREIGN KEY ("parentFolderId") REFERENCES public.folders(id) ON DELETE CASCADE;


--
-- Name: form_fields form_fields_formId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.form_fields
    ADD CONSTRAINT "form_fields_formId_fkey" FOREIGN KEY ("formId") REFERENCES public.forms(id) ON DELETE CASCADE;


--
-- Name: forms forms_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.forms
    ADD CONSTRAINT "forms_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: forms forms_pageId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.forms
    ADD CONSTRAINT "forms_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES public.pages(id) ON DELETE CASCADE;


--
-- Name: grid_field grid_field_gridId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.grid_field
    ADD CONSTRAINT "grid_field_gridId_fkey" FOREIGN KEY ("gridId") REFERENCES public.dg_grid(id) ON DELETE CASCADE;


--
-- Name: grid_group_access grid_group_access_gridId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.grid_group_access
    ADD CONSTRAINT "grid_group_access_gridId_fkey" FOREIGN KEY ("gridId") REFERENCES public.dg_grid(id) ON DELETE CASCADE;


--
-- Name: grid_group_access grid_group_access_groupId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.grid_group_access
    ADD CONSTRAINT "grid_group_access_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: grid_managed_cluster_resources grid_managed_cluster_resources_gridManagedClusterId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.grid_managed_cluster_resources
    ADD CONSTRAINT "grid_managed_cluster_resources_gridManagedClusterId_fkey" FOREIGN KEY ("gridManagedClusterId") REFERENCES public.grid_managed_clusters(id) ON DELETE CASCADE;


--
-- Name: grid_managed_cluster_resources grid_managed_cluster_resources_resourceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.grid_managed_cluster_resources
    ADD CONSTRAINT "grid_managed_cluster_resources_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES public.resources(id) ON DELETE CASCADE;


--
-- Name: grid_managed_cluster_resources grid_managed_cluster_resources_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.grid_managed_cluster_resources
    ADD CONSTRAINT "grid_managed_cluster_resources_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: grid_table_group_access grid_table_group_access_gridId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.grid_table_group_access
    ADD CONSTRAINT "grid_table_group_access_gridId_fkey" FOREIGN KEY ("gridId") REFERENCES public.dg_grid(id) ON DELETE CASCADE;


--
-- Name: grid_table_group_access grid_table_group_access_groupId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.grid_table_group_access
    ADD CONSTRAINT "grid_table_group_access_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: grid_table_user_access grid_table_user_access_gridId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.grid_table_user_access
    ADD CONSTRAINT "grid_table_user_access_gridId_fkey" FOREIGN KEY ("gridId") REFERENCES public.dg_grid(id) ON DELETE CASCADE;


--
-- Name: grid_table_user_access grid_table_user_access_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.grid_table_user_access
    ADD CONSTRAINT "grid_table_user_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: grid_user_access grid_user_access_gridId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.grid_user_access
    ADD CONSTRAINT "grid_user_access_gridId_fkey" FOREIGN KEY ("gridId") REFERENCES public.dg_grid(id) ON DELETE CASCADE;


--
-- Name: grid_user_access grid_user_access_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.grid_user_access
    ADD CONSTRAINT "grid_user_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: grid_view grid_view_createdByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.grid_view
    ADD CONSTRAINT "grid_view_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: grid_view grid_view_gridId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.grid_view
    ADD CONSTRAINT "grid_view_gridId_fkey" FOREIGN KEY ("gridId") REFERENCES public.dg_grid(id) ON DELETE CASCADE;


--
-- Name: group_folder_defaults group_folder_defaults_folderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.group_folder_defaults
    ADD CONSTRAINT "group_folder_defaults_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES public.folders(id) ON DELETE CASCADE;


--
-- Name: group_folder_defaults group_folder_defaults_groupId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.group_folder_defaults
    ADD CONSTRAINT "group_folder_defaults_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: group_pages group_pages_groupId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.group_pages
    ADD CONSTRAINT "group_pages_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: group_pages group_pages_pageId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.group_pages
    ADD CONSTRAINT "group_pages_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES public.pages(id) ON DELETE CASCADE;


--
-- Name: group_resource_folder_defaults group_resource_folder_defaults_groupId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.group_resource_folder_defaults
    ADD CONSTRAINT "group_resource_folder_defaults_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: group_resource_folder_defaults group_resource_folder_defaults_resourceFolderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.group_resource_folder_defaults
    ADD CONSTRAINT "group_resource_folder_defaults_resourceFolderId_fkey" FOREIGN KEY ("resourceFolderId") REFERENCES public.resource_folders(id) ON DELETE CASCADE;


--
-- Name: group_resources group_resources_groupId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.group_resources
    ADD CONSTRAINT "group_resources_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: group_resources group_resources_resourceIdForEnv_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.group_resources
    ADD CONSTRAINT "group_resources_resourceIdForEnv_fkey" FOREIGN KEY ("resourceIdForEnv") REFERENCES public.resources(id) ON DELETE CASCADE;


--
-- Name: group_resources group_resources_resourceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.group_resources
    ADD CONSTRAINT "group_resources_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES public.resources(id) ON DELETE CASCADE;


--
-- Name: group_workflows group_workflows_groupId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.group_workflows
    ADD CONSTRAINT "group_workflows_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: group_workflows group_workflows_workflowId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.group_workflows
    ADD CONSTRAINT "group_workflows_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES public.workflow(id) ON DELETE CASCADE;


--
-- Name: groups groups_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT "groups_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: iam_credentials iam_credentials_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.iam_credentials
    ADD CONSTRAINT "iam_credentials_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: instrumentation_integrations instrumentation_integrations_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.instrumentation_integrations
    ADD CONSTRAINT instrumentation_integrations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: language_configuration language_configuration_aliasFor_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.language_configuration
    ADD CONSTRAINT "language_configuration_aliasFor_fkey" FOREIGN KEY ("aliasFor") REFERENCES public.language_configuration(id) ON DELETE SET NULL;


--
-- Name: language_configuration language_configuration_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.language_configuration
    ADD CONSTRAINT "language_configuration_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: language_configuration_save language_configuration_save_languageConfigurationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.language_configuration_save
    ADD CONSTRAINT "language_configuration_save_languageConfigurationId_fkey" FOREIGN KEY ("languageConfigurationId") REFERENCES public.language_configuration(id) ON DELETE CASCADE;


--
-- Name: notification_applications notification_applications_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.notification_applications
    ADD CONSTRAINT "notification_applications_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: notification_applications notification_applications_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.notification_applications
    ADD CONSTRAINT "notification_applications_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: notification_subscribed_devices notification_subscribed_devices_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.notification_subscribed_devices
    ADD CONSTRAINT "notification_subscribed_devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: notification_topic_subscriptions notification_topic_subscriptions_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.notification_topic_subscriptions
    ADD CONSTRAINT "notification_topic_subscriptions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: notification_topic_subscriptions notification_topic_subscriptions_pageId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.notification_topic_subscriptions
    ADD CONSTRAINT "notification_topic_subscriptions_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES public.pages(uuid) ON DELETE CASCADE;


--
-- Name: notification_topic_subscriptions notification_topic_subscriptions_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.notification_topic_subscriptions
    ADD CONSTRAINT "notification_topic_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: org_image_blobs org_image_blobs_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.org_image_blobs
    ADD CONSTRAINT "org_image_blobs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_email_domains organization_email_domains_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.organization_email_domains
    ADD CONSTRAINT organization_email_domains_organization_id_fkey FOREIGN KEY ("organizationId") REFERENCES public.organizations(id);


--
-- Name: organization_user_attributes organization_user_attributes_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.organization_user_attributes
    ADD CONSTRAINT "organization_user_attributes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organizations organizations_defaultAppThemeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT "organizations_defaultAppThemeId_fkey" FOREIGN KEY ("defaultAppThemeId") REFERENCES public.app_themes(id) ON DELETE SET NULL;


--
-- Name: organizations organizations_parentOrgId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT "organizations_parentOrgId_fkey" FOREIGN KEY ("parentOrgId") REFERENCES public.organizations(id) ON DELETE SET NULL;


--
-- Name: organizations organizations_planId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT "organizations_planId_fkey" FOREIGN KEY ("planId") REFERENCES public.plans(id) ON DELETE SET NULL;


--
-- Name: organizations organizations_themeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT "organizations_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES public.themes(id) ON DELETE SET NULL;


--
-- Name: page_docs page_docs_lastEditedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.page_docs
    ADD CONSTRAINT "page_docs_lastEditedBy_fkey" FOREIGN KEY ("lastEditedBy") REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: page_docs page_docs_pageId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.page_docs
    ADD CONSTRAINT "page_docs_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES public.pages(id) ON DELETE CASCADE;


--
-- Name: page_favorites page_favorites_pageId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.page_favorites
    ADD CONSTRAINT "page_favorites_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES public.pages(id) ON DELETE CASCADE;


--
-- Name: page_favorites page_favorites_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.page_favorites
    ADD CONSTRAINT "page_favorites_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: page_onboarding_state page_onboarding_state_pageId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.page_onboarding_state
    ADD CONSTRAINT "page_onboarding_state_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES public.pages(id) ON DELETE CASCADE;


--
-- Name: page_save_playground_query_saves page_save_playground_query_saves_pageId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.page_save_playground_query_saves
    ADD CONSTRAINT "page_save_playground_query_saves_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES public.pages(id) ON DELETE CASCADE;


--
-- Name: page_save_playground_query_saves page_save_playground_query_saves_pageSaveId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.page_save_playground_query_saves
    ADD CONSTRAINT "page_save_playground_query_saves_pageSaveId_fkey" FOREIGN KEY ("pageSaveId") REFERENCES public.page_saves(id) ON DELETE CASCADE;


--
-- Name: page_save_playground_query_saves page_save_playground_query_saves_playgroundQueryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.page_save_playground_query_saves
    ADD CONSTRAINT "page_save_playground_query_saves_playgroundQueryId_fkey" FOREIGN KEY ("playgroundQueryId") REFERENCES public.playground_queries(id) ON DELETE CASCADE;


--
-- Name: page_save_playground_query_saves page_save_playground_query_saves_playgroundQuerySaveId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.page_save_playground_query_saves
    ADD CONSTRAINT "page_save_playground_query_saves_playgroundQuerySaveId_fkey" FOREIGN KEY ("playgroundQuerySaveId") REFERENCES public.playground_query_saves(id) ON DELETE CASCADE;


--
-- Name: page_saves page_saves_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.page_saves
    ADD CONSTRAINT "page_saves_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public.branches(id) ON DELETE SET NULL;


--
-- Name: page_saves page_saves_page_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.page_saves
    ADD CONSTRAINT page_saves_page_id_fkey FOREIGN KEY ("pageId") REFERENCES public.pages(id) ON DELETE CASCADE;


--
-- Name: page_saves page_saves_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.page_saves
    ADD CONSTRAINT "page_saves_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: page_user_heartbeats page_user_heartbeats_pageId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.page_user_heartbeats
    ADD CONSTRAINT "page_user_heartbeats_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES public.pages(id) ON DELETE CASCADE;


--
-- Name: page_user_heartbeats page_user_heartbeats_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.page_user_heartbeats
    ADD CONSTRAINT "page_user_heartbeats_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: pages pages_folderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.pages
    ADD CONSTRAINT "pages_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES public.folders(id) ON DELETE RESTRICT;


--
-- Name: pages pages_lastEditedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.pages
    ADD CONSTRAINT "pages_lastEditedBy_fkey" FOREIGN KEY ("lastEditedBy") REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: pages pages_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.pages
    ADD CONSTRAINT pages_organization_id_fkey FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: pages pages_releasedTagId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.pages
    ADD CONSTRAINT "pages_releasedTagId_fkey" FOREIGN KEY ("releasedTagId") REFERENCES public.tags(id) ON DELETE SET NULL;


--
-- Name: personal_access_tokens personal_access_tokens_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.personal_access_tokens
    ADD CONSTRAINT "personal_access_tokens_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: personal_access_tokens personal_access_tokens_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.personal_access_tokens
    ADD CONSTRAINT "personal_access_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: plan_features plan_features_featureId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.plan_features
    ADD CONSTRAINT "plan_features_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES public.features(id) ON DELETE CASCADE;


--
-- Name: plan_features plan_features_planId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.plan_features
    ADD CONSTRAINT "plan_features_planId_fkey" FOREIGN KEY ("planId") REFERENCES public.plans(id) ON DELETE CASCADE;


--
-- Name: playground_queries playground_queries_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.playground_queries
    ADD CONSTRAINT "playground_queries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: playground_queries playground_queries_ownerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.playground_queries
    ADD CONSTRAINT "playground_queries_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: playground_query_saves playground_query_saves_editorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.playground_query_saves
    ADD CONSTRAINT "playground_query_saves_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: playground_query_saves playground_query_saves_playgroundQueryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.playground_query_saves
    ADD CONSTRAINT "playground_query_saves_playgroundQueryId_fkey" FOREIGN KEY ("playgroundQueryId") REFERENCES public.playground_queries(id) ON DELETE CASCADE;


--
-- Name: playground_query_saves playground_query_saves_playgroundQueryUuid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.playground_query_saves
    ADD CONSTRAINT "playground_query_saves_playgroundQueryUuid_fkey" FOREIGN KEY ("playgroundQueryUuid") REFERENCES public.playground_queries(uuid) ON DELETE CASCADE;


--
-- Name: playground_query_saves playground_query_saves_playgroundQueryUuid_fkey1; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.playground_query_saves
    ADD CONSTRAINT "playground_query_saves_playgroundQueryUuid_fkey1" FOREIGN KEY ("playgroundQueryUuid") REFERENCES public.playground_queries(uuid) ON DELETE CASCADE;


--
-- Name: playground_query_saves playground_query_saves_resource_uuid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.playground_query_saves
    ADD CONSTRAINT playground_query_saves_resource_uuid_fkey FOREIGN KEY ("resourceUuid") REFERENCES public.resources(uuid) ON DELETE CASCADE;


--
-- Name: query_metadata query_metadata_appMetadataId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.query_metadata
    ADD CONSTRAINT "query_metadata_appMetadataId_fkey" FOREIGN KEY ("appMetadataId") REFERENCES public.app_metadata(id);


--
-- Name: recently_visited_apps recently_visited_apps_pageId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.recently_visited_apps
    ADD CONSTRAINT "recently_visited_apps_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES public.pages(id) ON DELETE CASCADE;


--
-- Name: recently_visited_apps recently_visited_apps_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.recently_visited_apps
    ADD CONSTRAINT "recently_visited_apps_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: resource_folders resource_folders_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.resource_folders
    ADD CONSTRAINT "resource_folders_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: resource_folders resource_folders_parentFolderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.resource_folders
    ADD CONSTRAINT "resource_folders_parentFolderId_fkey" FOREIGN KEY ("parentFolderId") REFERENCES public.resource_folders(id) ON DELETE RESTRICT;


--
-- Name: resources resources_environmentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.resources
    ADD CONSTRAINT "resources_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES public.environments(id) ON DELETE CASCADE;


--
-- Name: resources resources_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.resources
    ADD CONSTRAINT resources_organization_id_fkey FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: resources resources_resourceFolderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.resources
    ADD CONSTRAINT "resources_resourceFolderId_fkey" FOREIGN KEY ("resourceFolderId") REFERENCES public.resource_folders(id) ON DELETE RESTRICT;


--
-- Name: retool_databases retool_databases_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.retool_databases
    ADD CONSTRAINT retool_databases_organization_id_fkey FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: retool_db_migrations retool_db_migrations_cancelledById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.retool_db_migrations
    ADD CONSTRAINT "retool_db_migrations_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: retool_db_migrations retool_db_migrations_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.retool_db_migrations
    ADD CONSTRAINT "retool_db_migrations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: retool_db_migrations retool_db_migrations_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.retool_db_migrations
    ADD CONSTRAINT "retool_db_migrations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: retool_db_migrations retool_db_migrations_originEnvironmentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.retool_db_migrations
    ADD CONSTRAINT "retool_db_migrations_originEnvironmentId_fkey" FOREIGN KEY ("originEnvironmentId") REFERENCES public.environments(id) ON DELETE SET NULL;


--
-- Name: retool_db_migrations retool_db_migrations_targetEnvironmentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.retool_db_migrations
    ADD CONSTRAINT "retool_db_migrations_targetEnvironmentId_fkey" FOREIGN KEY ("targetEnvironmentId") REFERENCES public.environments(id) ON DELETE SET NULL;


--
-- Name: retool_db_provision retool_db_provision_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.retool_db_provision
    ADD CONSTRAINT "retool_db_provision_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE SET NULL;


--
-- Name: retool_db_provision retool_db_provision_resourceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.retool_db_provision
    ADD CONSTRAINT "retool_db_provision_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES public.resources(id) ON DELETE SET NULL;


--
-- Name: retool_files retool_files_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.retool_files
    ADD CONSTRAINT "retool_files_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: retool_files retool_files_folderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.retool_files
    ADD CONSTRAINT "retool_files_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES public.folders(id) ON DELETE RESTRICT;


--
-- Name: retool_files retool_files_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.retool_files
    ADD CONSTRAINT "retool_files_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: retool_files retool_files_resourceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.retool_files
    ADD CONSTRAINT "retool_files_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES public.resources(id) ON DELETE CASCADE;


--
-- Name: retool_files retool_files_updatedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.retool_files
    ADD CONSTRAINT "retool_files_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: retool_managed_note_comment retool_managed_note_comment_retoolManagedNoteId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.retool_managed_note_comment
    ADD CONSTRAINT "retool_managed_note_comment_retoolManagedNoteId_fkey" FOREIGN KEY ("retoolManagedNoteId") REFERENCES public.retool_managed_note(id);


--
-- Name: retool_managed_note_comment retool_managed_note_comment_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.retool_managed_note_comment
    ADD CONSTRAINT "retool_managed_note_comment_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id);


--
-- Name: retool_managed_note retool_managed_note_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.retool_managed_note
    ADD CONSTRAINT "retool_managed_note_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: retool_rules retool_rules_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.retool_rules
    ADD CONSTRAINT "retool_rules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: retool_table_events retool_table_events_retool_table_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.retool_table_events
    ADD CONSTRAINT retool_table_events_retool_table_id_fkey FOREIGN KEY ("retoolTableId") REFERENCES public.retool_tables(id) ON DELETE CASCADE;


--
-- Name: retool_tables retool_tables_retool_database_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.retool_tables
    ADD CONSTRAINT retool_tables_retool_database_id_fkey FOREIGN KEY ("retoolDatabaseId") REFERENCES public.retool_databases(id) ON DELETE CASCADE;


--
-- Name: role_pages_members role_pages_members_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.role_pages_members
    ADD CONSTRAINT "role_pages_members_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: role_pages_members role_pages_members_roleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.role_pages_members
    ADD CONSTRAINT "role_pages_members_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES public.role_pages(id) ON DELETE CASCADE;


--
-- Name: role_pages_members role_pages_members_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.role_pages_members
    ADD CONSTRAINT "role_pages_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: role_pages_members role_pages_members_userInviteId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.role_pages_members
    ADD CONSTRAINT "role_pages_members_userInviteId_fkey" FOREIGN KEY ("userInviteId") REFERENCES public.user_invites(id) ON DELETE CASCADE;


--
-- Name: role_pages role_pages_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.role_pages
    ADD CONSTRAINT "role_pages_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: role_pages role_pages_pageId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.role_pages
    ADD CONSTRAINT "role_pages_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES public.pages(id) ON DELETE CASCADE;


--
-- Name: secrets_manager_configs secrets_manager_configs_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.secrets_manager_configs
    ADD CONSTRAINT "secrets_manager_configs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: source_control_deployment_settings source_control_deployment_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.source_control_deployment_settings
    ADD CONSTRAINT source_control_deployment_organization_id_fkey FOREIGN KEY ("organizationId") REFERENCES public.organizations(id);


--
-- Name: source_control_deployments source_control_deployments_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.source_control_deployments
    ADD CONSTRAINT source_control_deployments_organization_id_fkey FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) NOT VALID;


--
-- Name: source_control_deployments source_control_deployments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.source_control_deployments
    ADD CONSTRAINT source_control_deployments_user_id_fkey FOREIGN KEY ("triggeredBy") REFERENCES public.users(id);


--
-- Name: source_control_provider_configs source_control_provider_configs_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.source_control_provider_configs
    ADD CONSTRAINT "source_control_provider_configs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: source_control_relationships source_control_relationships_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.source_control_relationships
    ADD CONSTRAINT "source_control_relationships_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: source_control_relationships source_control_relationships_commitId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.source_control_relationships
    ADD CONSTRAINT "source_control_relationships_commitId_fkey" FOREIGN KEY ("commitId") REFERENCES public.commits(id) ON DELETE CASCADE;


--
-- Name: source_control_repo_migration_logs source_control_repo_migration_logs_migrationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.source_control_repo_migration_logs
    ADD CONSTRAINT "source_control_repo_migration_logs_migrationId_fkey" FOREIGN KEY ("migrationId") REFERENCES public.source_control_repo_migrations(id) ON DELETE CASCADE;


--
-- Name: source_control_repo_migration_logs source_control_repo_migration_logs_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.source_control_repo_migration_logs
    ADD CONSTRAINT "source_control_repo_migration_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: source_control_repo_migrations source_control_repo_migrations_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.source_control_repo_migrations
    ADD CONSTRAINT "source_control_repo_migrations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: source_control_repo_migrations source_control_repo_migrations_triggeredBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.source_control_repo_migrations
    ADD CONSTRAINT "source_control_repo_migrations_triggeredBy_fkey" FOREIGN KEY ("triggeredBy") REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: source_control_settings source_control_settings_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.source_control_settings
    ADD CONSTRAINT "source_control_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: source_control_user_info source_control_user_info_head_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.source_control_user_info
    ADD CONSTRAINT source_control_user_info_head_fkey FOREIGN KEY (head) REFERENCES public.branches(id) ON DELETE SET NULL;


--
-- Name: source_control_user_info source_control_user_info_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.source_control_user_info
    ADD CONSTRAINT "source_control_user_info_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: source_control_user_info source_control_user_info_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.source_control_user_info
    ADD CONSTRAINT "source_control_user_info_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: ssh_keys ssh_keys_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.ssh_keys
    ADD CONSTRAINT "ssh_keys_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: startup_programs startup_programs_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.startup_programs
    ADD CONSTRAINT "startup_programs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: storage_blobs storage_blobs_creatorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.storage_blobs
    ADD CONSTRAINT "storage_blobs_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: storage_blobs storage_blobs_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.storage_blobs
    ADD CONSTRAINT "storage_blobs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: tags tags_creatorUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT "tags_creatorUserId_fkey" FOREIGN KEY ("creatorUserId") REFERENCES public.users(id);


--
-- Name: tags tags_pageId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT "tags_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES public.pages(id) ON DELETE CASCADE;


--
-- Name: tags tags_pageSaveId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT "tags_pageSaveId_fkey" FOREIGN KEY ("pageSaveId") REFERENCES public.page_saves(id) ON DELETE CASCADE;


--
-- Name: tags tags_releaserUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT "tags_releaserUserId_fkey" FOREIGN KEY ("releaserUserId") REFERENCES public.users(id);


--
-- Name: temporal_cloud_settings temporal_cloud_settings_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.temporal_cloud_settings
    ADD CONSTRAINT "temporal_cloud_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: temporal_cloud_settings temporal_cloud_settings_temporalCloudTlsConfigId_foreign_key; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.temporal_cloud_settings
    ADD CONSTRAINT "temporal_cloud_settings_temporalCloudTlsConfigId_foreign_key" FOREIGN KEY ("temporalCloudTlsConfigId") REFERENCES public.temporal_cloud_tls_configs(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: temporal_cloud_tls_configs temporal_cloud_tls_configs_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.temporal_cloud_tls_configs
    ADD CONSTRAINT "temporal_cloud_tls_configs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: themes themes_headerModulePageId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.themes
    ADD CONSTRAINT "themes_headerModulePageId_fkey" FOREIGN KEY ("headerModulePageId") REFERENCES public.pages(id) ON DELETE CASCADE;


--
-- Name: tracked_property_usages tracked_property_usages_pageId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.tracked_property_usages
    ADD CONSTRAINT "tracked_property_usages_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES public.pages(id) ON DELETE CASCADE;


--
-- Name: user_groups user_groups_groupId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.user_groups
    ADD CONSTRAINT "user_groups_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: user_groups user_groups_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.user_groups
    ADD CONSTRAINT "user_groups_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_invite_groups user_invite_groups_groupId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.user_invite_groups
    ADD CONSTRAINT "user_invite_groups_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: user_invite_groups user_invite_groups_userInviteId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.user_invite_groups
    ADD CONSTRAINT "user_invite_groups_userInviteId_fkey" FOREIGN KEY ("userInviteId") REFERENCES public.user_invites(id) ON DELETE CASCADE;


--
-- Name: user_invite_suggestions user_invite_suggestions_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.user_invite_suggestions
    ADD CONSTRAINT "user_invite_suggestions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: user_invite_suggestions user_invite_suggestions_suggestedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.user_invite_suggestions
    ADD CONSTRAINT "user_invite_suggestions_suggestedById_fkey" FOREIGN KEY ("suggestedById") REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: user_invite_suggestions user_invite_suggestions_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.user_invite_suggestions
    ADD CONSTRAINT "user_invite_suggestions_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: user_invites user_invites_claimed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.user_invites
    ADD CONSTRAINT user_invites_claimed_by_fkey FOREIGN KEY ("claimedById") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_invites user_invites_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.user_invites
    ADD CONSTRAINT user_invites_invited_by_fkey FOREIGN KEY ("invitedById") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_invites user_invites_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.user_invites
    ADD CONSTRAINT user_invites_organization_id_fkey FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: user_login_ip_addresses user_login_ip_addresses_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.user_login_ip_addresses
    ADD CONSTRAINT "user_login_ip_addresses_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_session_states user_session_states_resourceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.user_session_states
    ADD CONSTRAINT "user_session_states_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES public.resources(id) ON DELETE CASCADE;


--
-- Name: user_session_states user_session_states_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.user_session_states
    ADD CONSTRAINT "user_session_states_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_viewed_features user_viewed_features_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.user_viewed_features
    ADD CONSTRAINT "user_viewed_features_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users users_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_organization_id_fkey FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: vectors vectors_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.vectors
    ADD CONSTRAINT "vectors_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: vscode_sessions vscode_sessions_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.vscode_sessions
    ADD CONSTRAINT "vscode_sessions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: vscode_types vscode_types_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.vscode_types
    ADD CONSTRAINT "vscode_types_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: workflow_aggregate_usage workflow_aggregate_usage_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.workflow_aggregate_usage
    ADD CONSTRAINT "workflow_aggregate_usage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: workflow_aggregate_usage workflow_aggregate_usage_workflowId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.workflow_aggregate_usage
    ADD CONSTRAINT "workflow_aggregate_usage_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES public.workflow(id) ON DELETE SET NULL;


--
-- Name: workflow_block_results workflow_block_results_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.workflow_block_results
    ADD CONSTRAINT "workflow_block_results_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: workflow_block_runs workflow_block_runs_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.workflow_block_runs
    ADD CONSTRAINT "workflow_block_runs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: workflow_block_runs workflow_block_runs_workflowId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.workflow_block_runs
    ADD CONSTRAINT "workflow_block_runs_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES public.workflow(id) ON DELETE CASCADE;


--
-- Name: workflow_block_runs workflow_block_runs_workflowRunId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.workflow_block_runs
    ADD CONSTRAINT "workflow_block_runs_workflowRunId_fkey" FOREIGN KEY ("workflowRunId") REFERENCES public.workflow_run(id) ON DELETE CASCADE;


--
-- Name: workflow workflow_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.workflow
    ADD CONSTRAINT "workflow_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public.users(id);


--
-- Name: workflow workflow_folderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.workflow
    ADD CONSTRAINT "workflow_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES public.folders(id) ON DELETE RESTRICT;


--
-- Name: workflow workflow_folderId_fkey1; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.workflow
    ADD CONSTRAINT "workflow_folderId_fkey1" FOREIGN KEY ("folderId") REFERENCES public.folders(id) ON DELETE RESTRICT;


--
-- Name: workflow workflow_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.workflow
    ADD CONSTRAINT "workflow_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: workflow workflow_releaseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.workflow
    ADD CONSTRAINT "workflow_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES public.workflow_release(id) ON DELETE SET NULL;


--
-- Name: workflow_release workflow_release_creatorUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.workflow_release
    ADD CONSTRAINT "workflow_release_creatorUserId_fkey" FOREIGN KEY ("creatorUserId") REFERENCES public.users(id);


--
-- Name: workflow_release workflow_release_releaserUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.workflow_release
    ADD CONSTRAINT "workflow_release_releaserUserId_fkey" FOREIGN KEY ("releaserUserId") REFERENCES public.users(id);


--
-- Name: workflow_release workflow_release_workflowId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.workflow_release
    ADD CONSTRAINT "workflow_release_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES public.workflow(id) ON DELETE CASCADE;


--
-- Name: workflow_release workflow_release_workflowSaveId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.workflow_release
    ADD CONSTRAINT "workflow_release_workflowSaveId_fkey" FOREIGN KEY ("workflowSaveId") REFERENCES public.workflow_save(id) ON DELETE CASCADE;


--
-- Name: workflow_run workflow_run_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.workflow_run
    ADD CONSTRAINT "workflow_run_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public.users(id);


--
-- Name: workflow_run workflow_run_environmentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.workflow_run
    ADD CONSTRAINT "workflow_run_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES public.environments(id) ON DELETE SET NULL;


--
-- Name: workflow_run_logs workflow_run_logs_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.workflow_run_logs
    ADD CONSTRAINT "workflow_run_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: workflow_run_logs workflow_run_logs_workflowId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.workflow_run_logs
    ADD CONSTRAINT "workflow_run_logs_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES public.workflow(id) ON DELETE CASCADE;


--
-- Name: workflow_run_logs workflow_run_logs_workflowRunId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.workflow_run_logs
    ADD CONSTRAINT "workflow_run_logs_workflowRunId_fkey" FOREIGN KEY ("workflowRunId") REFERENCES public.workflow_run(id) ON DELETE CASCADE;


--
-- Name: workflow_run workflow_run_triggerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.workflow_run
    ADD CONSTRAINT "workflow_run_triggerId_fkey" FOREIGN KEY ("triggerId") REFERENCES public.workflow_trigger(id) ON DELETE SET NULL;


--
-- Name: workflow_run workflow_run_workflowId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.workflow_run
    ADD CONSTRAINT "workflow_run_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES public.workflow(id) ON DELETE CASCADE;


--
-- Name: workflow_run workflow_run_workflowSaveId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.workflow_run
    ADD CONSTRAINT "workflow_run_workflowSaveId_fkey" FOREIGN KEY ("workflowSaveId") REFERENCES public.workflow_save(id);


--
-- Name: workflow_save workflow_save_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.workflow_save
    ADD CONSTRAINT "workflow_save_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public.users(id);


--
-- Name: workflow_save workflow_save_javascriptLanguageConfigurationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.workflow_save
    ADD CONSTRAINT "workflow_save_javascriptLanguageConfigurationId_fkey" FOREIGN KEY ("javascriptLanguageConfigurationId") REFERENCES public.language_configuration(id) ON DELETE SET NULL;


--
-- Name: workflow_save workflow_save_javascriptLanguageConfigurationSaveId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.workflow_save
    ADD CONSTRAINT "workflow_save_javascriptLanguageConfigurationSaveId_fkey" FOREIGN KEY ("javascriptLanguageConfigurationSaveId") REFERENCES public.language_configuration_save(id) ON DELETE SET NULL;


--
-- Name: workflow_save workflow_save_pythonLanguageConfigurationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.workflow_save
    ADD CONSTRAINT "workflow_save_pythonLanguageConfigurationId_fkey" FOREIGN KEY ("pythonLanguageConfigurationId") REFERENCES public.language_configuration(id) ON DELETE SET NULL;


--
-- Name: workflow_save workflow_save_pythonLanguageConfigurationSaveId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.workflow_save
    ADD CONSTRAINT "workflow_save_pythonLanguageConfigurationSaveId_fkey" FOREIGN KEY ("pythonLanguageConfigurationSaveId") REFERENCES public.language_configuration_save(id) ON DELETE SET NULL;


--
-- Name: workflow_save workflow_save_workflowId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.workflow_save
    ADD CONSTRAINT "workflow_save_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES public.workflow(id) ON DELETE CASCADE;


--
-- Name: workflow_tracked_property_usages workflow_tracked_property_usages_workflowId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.workflow_tracked_property_usages
    ADD CONSTRAINT "workflow_tracked_property_usages_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES public.workflow(id) ON DELETE CASCADE;


--
-- Name: workflow_tracked_property_usages workflow_tracked_property_usages_workflowId_fkey1; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.workflow_tracked_property_usages
    ADD CONSTRAINT "workflow_tracked_property_usages_workflowId_fkey1" FOREIGN KEY ("workflowId") REFERENCES public.workflow(id) ON DELETE CASCADE;


--
-- Name: workflow_trigger workflow_trigger_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.workflow_trigger
    ADD CONSTRAINT "workflow_trigger_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: workflow_trigger workflow_trigger_environmentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.workflow_trigger
    ADD CONSTRAINT "workflow_trigger_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES public.environments(id) ON DELETE SET NULL;


--
-- Name: workflow_trigger workflow_trigger_workflowId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.workflow_trigger
    ADD CONSTRAINT "workflow_trigger_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES public.workflow(id) ON DELETE CASCADE;


--
-- Name: workspaces workspaces_groupId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT "workspaces_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: workspaces workspaces_homePageId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: retool_internal_user
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT "workspaces_homePageId_fkey" FOREIGN KEY ("homePageId") REFERENCES public.pages(id) ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--
