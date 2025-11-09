#!/bin/bash

# Delete All Interviews Script
# This script deletes all existing interviews and related invitations from the database

cd "$(dirname "$0")/../server"
node scripts/delete-all-interviews.js

