-- Direct audio file link from the RSS enclosure: a reliable source link when an episode's
-- web page is gone (e.g. retired Spotify-for-Podcasters pages) and there is no YouTube video.
alter table episodes add column if not exists audio_url text;
