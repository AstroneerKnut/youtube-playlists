import React, { useEffect, useState } from "react";
import "./App.css";

const API_KEY = import.meta.env.VITE_YT_API_KEY;
const CHANNEL_ID = "UCA1N1Jl-o8gnEenkvMdUrmw";
const MAX_RESULTS = 50;

const PlaylistViewer = () => {
  const [playlists, setPlaylists] = useState([]);
  const [search, setSearch] = useState("");
  const [sortOption, setSortOption] = useState("newest");
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [selectedYear, setSelectedYear] = useState("alle");
  const [selectedGenre, setSelectedGenre] = useState("alle");
  const [allYears, setAllYears] = useState([]);
  const [allGenres, setAllGenres] = useState([]);

  useEffect(() => {
    fetchAllPlaylists();
  }, []);

  const fetchAllPlaylists = async () => {
    setLoading(true);
	setApiError(null);
    let allPlaylists = [];
    let allGenreSet = new Set();
    let allYearSet = new Set();
    let pageToken = "";

try {
    do {
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails&channelId=${CHANNEL_ID}&maxResults=${MAX_RESULTS}&pageToken=${pageToken}&key=${API_KEY}`
      );
      const data = await response.json();
	  if (data.error) throw new Error(data.error.message);
      if (data.items) {
        const enriched = await Promise.all(
          data.items.map(async (playlist) => {
            const hasPublicVideos = await checkPlaylistHasPublicVideos(playlist.id);
            if (!hasPublicVideos) return null;

            const { year, genres, length, videoCount } = parseDescription(playlist.snippet.description || "");

            if (year) allYearSet.add(year);
            genres.forEach((g) => allGenreSet.add(g));

            const totalDuration = length || await getPlaylistDuration(playlist.id);
            const itemCount = videoCount !== null ? videoCount : await getPublicVideoCount(playlist.id);

            return {
              ...playlist,
              totalDuration,
              durationSource: length ? "description" : "api",
              contentDetails: {
                ...playlist.contentDetails,
                itemCount,
                itemCountSource: videoCount !== null ? "description" : "api",
              },
              year,
              genres,
            };
          })
        );
        allPlaylists = [...allPlaylists, ...enriched.filter(Boolean)];
      }
      pageToken = data.nextPageToken;
    } while (pageToken);

    setPlaylists(allPlaylists);
    setAllYears(Array.from(allYearSet).sort((a, b) => b - a));
    setAllGenres(Array.from(allGenreSet).sort());
	} catch (err) {
      setApiError("Das Tageslimit der YouTube API wurde erreicht. Bitte versuche es morgen erneut.");
    }
    setLoading(false);
  };

  const parseDescription = (desc) => {
    const lines = desc.split("\n").map((line) => line.trim());
    let year = null;
    let genres = [];
    let length = null;
    let videoCount = null;

    lines.forEach((line) => {
      if (line.toLowerCase().startsWith("erscheinungsjahr:")) {
        const match = line.match(/Erscheinungsjahr:\s*(\d{4})/i);
        if (match) year = match[1];
      }
      if (line.toLowerCase().startsWith("genre:")) {
        const match = line.match(/Genre:\s*(.+)/i);
        if (match) {
          genres = match[1].split(",").map((g) => g.trim());
        }
      }
      if (line.toLowerCase().startsWith("videos:")) {
        const match = line.match(/Videos:\s*(\d+)/i);
        if (match) videoCount = parseInt(match[1]);
      }
      if (line.toLowerCase().startsWith("länge:")) {
        const match = line.match(/Länge:\s*(.+)/i);
        if (match) length = match[1];
      }
    });
    return { year, genres, length, videoCount };
  };

  const checkPlaylistHasPublicVideos = async (playlistId) => {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,status&playlistId=${playlistId}&maxResults=5&key=${API_KEY}`
    );
    const data = await response.json();
    return data.items && data.items.some((item) => item.status.privacyStatus === "public");
  };

  const getPublicVideoCount = async (playlistId) => {
    let count = 0;
    let pageToken = "";
    do {
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/playlistItems?part=status&playlistId=${playlistId}&maxResults=50&pageToken=${pageToken}&key=${API_KEY}`
      );
      const data = await response.json();
      count += data.items.filter(item => item.status?.privacyStatus === "public").length;
      pageToken = data.nextPageToken;
    } while (pageToken);
    return count;
  };

  const getPlaylistDuration = async (playlistId) => {
    let totalSeconds = 0;
    let pageToken = "";
    do {
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${playlistId}&maxResults=50&pageToken=${pageToken}&key=${API_KEY}`
      );
      const data = await response.json();
      const videoIds = data.items.map((item) => item.contentDetails.videoId).join(",");
      if (videoIds) {
        const videoResponse = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${videoIds}&key=${API_KEY}`
        );
        const videoData = await videoResponse.json();
        videoData.items.forEach((video) => {
          const duration = video.contentDetails.duration;
          totalSeconds += parseISODuration(duration);
        });
      }
      pageToken = data.nextPageToken;
    } while (pageToken);
    return formatDuration(totalSeconds);
  };

  const parseISODuration = (duration) => {
    const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
    const hours = match[1] ? parseInt(match[1]) : 0;
    const minutes = match[2] ? parseInt(match[2]) : 0;
    const seconds = match[3] ? parseInt(match[3]) : 0;
    return hours * 3600 + minutes * 60 + seconds;
  };

  const formatDuration = (totalSeconds) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  const sortedPlaylists = [...playlists]
    .filter((p) => {
      if (sortOption === "year-asc" || sortOption === "year-desc") {
        return p.year !== null && p.year !== undefined;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortOption === "name-asc") return a.snippet.title.localeCompare(b.snippet.title);
      if (sortOption === "name-desc") return b.snippet.title.localeCompare(a.snippet.title);
      if (sortOption === "newest") return new Date(b.snippet.publishedAt) - new Date(a.snippet.publishedAt);
      if (sortOption === "oldest") return new Date(a.snippet.publishedAt) - new Date(b.snippet.publishedAt);
      if (sortOption === "year-asc") return (a.year || 0) - (b.year || 0);
      if (sortOption === "year-desc") return (b.year || 0) - (a.year || 0);
      return 0;
    });

  const filteredPlaylists = sortedPlaylists.filter((p) => {
    const title = p.snippet.title.toLowerCase();
    const matchesSearch = title.includes(search.toLowerCase());
    const matchesYear = selectedYear === "alle" || p.year === selectedYear;
    const matchesGenre = selectedGenre === "alle" || (p.genres || []).includes(selectedGenre);
    return matchesSearch && matchesYear && matchesGenre;
  });

return (
  <>
    {/* HEADER-BANNER */}
    <div style={{ position: "relative", width: "100vw", overflow: "hidden" }}>
      <img
        src="/header.jpg"
        alt="Astroneer Knut Banner"
        style={{ width: "100%", height: "auto", display: "block" }}
      />
      <h1
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          color: "#eeeeee",
          fontSize: "clamp(1rem, 4vw, 3.5rem)",
          fontFamily: "'Orbitron', sans-serif",
          textAlign: "center",
          textShadow: "2px 2px 4px rgba(0, 0, 0, 0.7)",
        }}
      >
        Astroneer Knut – YouTube Playlists
      </h1>
    </div>

    {/* CONTENT-BLOCK */}
    <div className="p-6 max-w-6xl mx-auto">
      <div style={{ height: "1rem" }}></div>

      {/* Ladeanzeige */}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <p className="text-gray-500 mb-4">Playlists werden geladen…</p>
        </div>
      ) : (
        <>
		    {/* Fehleranzeige bei API-Problem */}
    {apiError && (
      <div style={{
        textAlign: "center",
        color: "red",
        fontWeight: "bold",
        marginBottom: "1rem"
      }}>
        {apiError}
      </div>
    )}
          {/* Gesamtanzahl + Gefiltert */}
          <p
            style={{
              textAlign: "center",
              fontSize: "1rem",
              fontWeight: "500",
              marginBottom: "1rem",
            }}
          >
            Aktuelle Gesamtanzahl verfügbarer Playlists: {playlists.length}
            {filteredPlaylists.length !== playlists.length &&
			` – Gefiltert: ${filteredPlaylists.length}`}

          </p>
        </>
      )}

      {/* Suchfeld */}
      <input
        type="text"
        placeholder="Suche nach Playlists..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="filter-input"
      />

      {/* Filterleiste */}
      <div className="filter-bar">
        <select value={sortOption} onChange={(e) => setSortOption(e.target.value)}>
          <option value="newest">Neueste zuerst</option>
          <option value="oldest">Älteste zuerst</option>
          <option value="name-asc">Name (A–Z)</option>
          <option value="name-desc">Name (Z–A)</option>
          <option value="year-asc">Erscheinungsjahr ↑</option>
          <option value="year-desc">Erscheinungsjahr ↓</option>
        </select>
        <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)}>
          <option value="alle">Alle Jahre</option>
          {allYears.map((year) => (
            <option key={year} value={year}>{year}</option>
          ))}
        </select>
        <select value={selectedGenre} onChange={(e) => setSelectedGenre(e.target.value)}>
          <option value="alle">Alle Genres</option>
          {allGenres.map((genre) => (
            <option key={genre} value={genre}>{genre}</option>
          ))}
        </select>
      </div>

      <div style={{ height: "1rem" }}></div>

      {/* Ergebnisanzeige */}
      {!loading && filteredPlaylists.length === 0 ? (
        <p style={{
          textAlign: "center",
          fontSize: "1.1rem",
          fontWeight: "500",
          margin: "2rem 0",
          color: "#666"
        }}>
          Keine Playlists zu den eingestellten Filterkriterien vorhanden
        </p>
      ) : (
	  <div className="playlist-container">
        <div className={`playlist-grid ${filteredPlaylists.length <= 4 ? "grid-narrow" : ""}`}>
          {filteredPlaylists.map((playlist) => (
            <div key={playlist.id} className="playlist-card">
              <a
                href={`https://www.youtube.com/playlist?list=${playlist.id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <div className="thumbnail-wrapper">
                  <img
                    src={playlist.snippet.thumbnails.medium.url}
                    alt={playlist.snippet.title}
                    className="playlist-thumb"
                  />
                </div>
              </a>
              <h2 style={{ color: "#000" }}>{playlist.snippet.title}</h2>
              <p className="desc">{playlist.snippet.description.split("\n")[0]}</p>
              {playlist.year && <p className="meta">Erscheinungsjahr: {playlist.year}</p>}
              {playlist.genres?.length > 0 && (
                <p className="meta">Genre: {playlist.genres.join(", ")}</p>
              )}
              <p className="meta">
                Videos: {playlist.contentDetails.itemCount}{" "}
                {playlist.contentDetails.itemCountSource === "api" && (
                  <span style={{ color: "red" }}>(aktuell)</span>
                )}
              </p>
              <p className="meta">
                Länge: {playlist.totalDuration}{" "}
                {playlist.durationSource === "api" && (
                  <span style={{ color: "red" }}>(aktuell)</span>
                )}
              </p>
            </div>
          ))}
        </div>
		</div>
      )}
    </div>
  </>
);
};

export default PlaylistViewer;
