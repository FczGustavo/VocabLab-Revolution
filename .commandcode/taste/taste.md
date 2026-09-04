# Taste (Continuously Learned by [CommandCode][cmd])

[cmd]: https://commandcode.ai/

# pronunciation
See [pronunciation/taste.md](pronunciation/taste.md)
# prompt-engineering
See [prompt-engineering/taste.md](prompt-engineering/taste.md)
# ui
See [ui/taste.md](ui/taste.md)
# sync
See [sync/taste.md](sync/taste.md)
# communication
See [communication/taste.md](communication/taste.md)
# settings-ui
- In Settings, the synonyms/antonyms toggle should NOT exist as a separate switch — the synonyms level slider (0-3) already controls whether synonyms are shown (0 = off, 1-3 = on). Confidence: 0.85

# repository/packaging-hygiene
- Keep the tracked repo clean: don't commit documentation/handoff folders OR visual design reference assets (folders and archive `.zip` files) that belong to another project or project version — such material should be git-ignored (and untracked via `git rm --cached`) rather than versioned alongside the code. Critically, the user wants these items only ignored by git, never deleted from disk — preserving the local files is mandatory. Confidence: 0.9
- Organize repo-local clutter into named folders by category: non-essential files get git-ignored (not committed), useless leftovers are gathered into a `temp/` (or "temp") folder, and material that aids building an earlier project version (e.g. design references, build documentation) goes into a dedicated "Classic Build" folder — such categorized folders remain local and are git-ignored too. Confidence: 0.8
- Prefer a safe, staged approach (propose a plan, confirm classification) before physically moving or untracking files during repo reorganization, so nothing is deleted by mistake. Confidence: 0.7
