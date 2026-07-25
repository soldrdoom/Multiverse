CREATE TABLE IF NOT EXISTS fluxer.news_stories (
    story_id bigint,
    title text,
    body text,
    status text,
    created_by_user_id bigint,
    created_at timestamp,
    updated_at timestamp,
    published_at timestamp,
    PRIMARY KEY ((story_id))
);

CREATE TABLE IF NOT EXISTS fluxer.news_stories_by_status (
    status text,
    created_at timestamp,
    story_id bigint,
    title text,
    body text,
    created_by_user_id bigint,
    updated_at timestamp,
    published_at timestamp,
    PRIMARY KEY ((status), created_at, story_id)
) WITH CLUSTERING ORDER BY (created_at DESC, story_id DESC);
