# PX4 SITL (Software In The Loop) Container
# Builds PX4 autopilot firmware and runs it in simulation mode
# Base: Ubuntu 24.04 (matches QGroundControl container)

FROM ubuntu:24.04

WORKDIR /px4

# Prevent interactive prompts during build
ENV DEBIAN_FRONTEND=noninteractive
ENV PX4_HOME_LAT=47.3977
ENV PX4_HOME_LON=8.5456
ENV PX4_HOME_ALT=488

# Use a Python virtualenv to bypass PEP 668 restrictions in Ubuntu 24.04
ENV VIRTUAL_ENV=/opt/px4-venv
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    wget \
    curl \
    sudo \
    lsb-release \
    gnupg \
    ca-certificates \
    build-essential \
    cmake \
    python3 \
    python3-pip \
    python3-dev \
    python3-venv \
    ninja-build \
    ccache \
    pkg-config \
    libssl-dev \
    lib32z1-dev \
    libc6-i386 \
    x11-apps \
    libcanberra-gtk-module \
    libxkbcommon-x11-0 \
    && rm -rf /var/lib/apt/lists/*

# Create Python virtual environment for PX4 tooling
RUN python3 -m venv $VIRTUAL_ENV

# Clone PX4 Autopilot repository (recursive for submodules)
RUN git clone https://github.com/PX4/PX4-Autopilot.git --recursive .

# Install PX4-specific dependencies (no Gazebo, no sim tools - we just want SITL)
RUN bash ./Tools/setup/ubuntu.sh --no-sim-tools --no-gazebo

# Build PX4 SITL firmware only (does NOT auto-run)
# `px4_sitl_default` compiles the binary; `make px4_sitl none` would auto-launch
RUN make px4_sitl_default

# Expose MAVLink UDP port
EXPOSE 14550/udp

# Default command: run PX4 SITL headless
# This streams MAVLink telemetry on UDP port 14550
CMD ["./build/px4_sitl_default/bin/px4", "-d"]
