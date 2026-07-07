# Backup and Restore Guide

This guide explains how to use the workspace backup and restore scripts.

## Location

- Backups are stored in `/home/iffiolen/VS-Code-Projects/_workspace_backups/QORTIUM/qortium-blog`
- Backup filenames follow `qortium-blog-YYYY-MM-DD_HH-MM-SS.tar.gz`

## Create a backup

Run from the project root:

```bash
npm run backup:workspace
```

This command:

- creates a `.tar.gz` backup of the workspace
- adds a timestamp to the filename
- keeps the newest backups automatically
- removes older backups automatically
- uses `BACKUP_RETENTION` if you want to change the default retention (default: 3)

## Restore from a backup

Run from the project root:

```bash
npm run restore:workspace
```

You can also restore a specific backup by providing its number:

```bash
npm run restore:workspace -- 1
```

For a fully non-interactive restore, pass the confirmation token too:

```bash
npm run restore:workspace -- 1 RESTORE
```

Restore flow:

- the script shows a numbered list of available backups
- you choose the backup by number
- you confirm the action by typing `RESTORE`

## Important warning

Restore replaces workspace files with the selected backup contents.

- the script keeps the `.git` directory
- all other workspace files are replaced by the selected backup

## Run the scripts directly

If needed, you can also run:

```bash
bash scripts/backup-workspace.sh
bash scripts/restore-workspace.sh
```

For scripted restore use:

```bash
bash scripts/restore-workspace.sh 1 RESTORE
```
