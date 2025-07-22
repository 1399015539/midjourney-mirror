# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This appears to be a Midjourney Mirror project based on the environment configuration. The project includes:

- PostgreSQL database integration
- Redis caching layer  
- JWT authentication system
- Midjourney API integration with proxy support
- Admin panel functionality

## Environment Setup

The project uses environment variables defined in `.env.example`:

- **Database**: PostgreSQL (default: localhost:5432/midjourney_mirror)
- **Cache**: Redis (default: localhost:6379/0)
- **Authentication**: JWT with configurable expiration
- **API Integration**: Midjourney API with proxy pool support
- **Admin Access**: Configurable admin credentials
- **Features**: Registrations and mirror API can be toggled

## Development Notes

- Copy `.env.example` to `.env` and configure appropriate values
- Default admin credentials are admin/admin123 (should be changed in production)
- The system supports proxy rotation for API calls
- Mirror API is enabled by default with `/api/v1` prefix