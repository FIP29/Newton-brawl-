package com.newtonbrawl.auth;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.newtonbrawl.player.PlayerRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** End-to-end: register -> login -> call a protected endpoint with the JWT. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AuthFlowIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired PlayerRepository players;

    @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;

    @BeforeEach
    void clean() {
        com.newtonbrawl.TestData.wipe(jdbc);
    }

    private MvcResult register(String username, String email, String password) throws Exception {
        String body = """
            {"username":"%s","email":"%s","password":"%s"}""".formatted(username, email, password);
        return mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON).content(body))
            .andReturn();
    }

    @Test
    void registerLoginAndFetchProfile() throws Exception {
        MvcResult reg = register("isaac", "isaac@cambridge.ac.uk", "apples-fall-down");
        assertThat(reg.getResponse().getStatus()).isEqualTo(201);
        JsonNode regJson = json.readTree(reg.getResponse().getContentAsString());
        assertThat(regJson.get("token").asText()).isNotBlank();
        assertThat(regJson.at("/player/rankTier").asText()).isEqualTo("ATOM");
        assertThat(regJson.at("/player/elo").asInt()).isEqualTo(1000);

        // Login by email (case-insensitive) works too.
        MvcResult login = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"login\":\"ISAAC@cambridge.ac.uk\",\"password\":\"apples-fall-down\"}"))
            .andExpect(status().isOk())
            .andReturn();
        String token = json.readTree(login.getResponse().getContentAsString()).get("token").asText();

        mvc.perform(get("/api/players/me").header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.username").value("isaac"))
            .andExpect(jsonPath("$.email").doesNotExist())
            .andExpect(jsonPath("$.rankTierName").value("Atom"));

        mvc.perform(patch("/api/players/me").header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"displayName\":\"Sir Isaac\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.displayName").value("Sir Isaac"));
    }

    @Test
    void guestPlaysCasualButNotRankedThenClaimsAnAccount() throws Exception {
        MvcResult g = mvc.perform(post("/api/auth/guest")).andExpect(status().isCreated()).andReturn();
        JsonNode gj = json.readTree(g.getResponse().getContentAsString());
        String token = gj.get("token").asText();
        assertThat(gj.at("/player/guest").asBoolean()).isTrue();
        assertThat(gj.at("/player/username").asText()).startsWith("Guest-");
        long id = gj.at("/player/id").asLong();

        mvc.perform(post("/api/matchmaking/ranked").header("Authorization", "Bearer " + token))
            .andExpect(status().isForbidden());
        mvc.perform(post("/api/matchmaking/casual").header("Authorization", "Bearer " + token))
            .andExpect(status().isCreated());

        MvcResult claim = mvc.perform(post("/api/auth/claim").header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"marie\",\"email\":\"marie@sorbonne.fr\",\"password\":\"radium-glows\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.player.guest").value(false))
            .andExpect(jsonPath("$.player.username").value("marie"))
            .andReturn();
        assertThat(json.readTree(claim.getResponse().getContentAsString()).at("/player/id").asLong()).isEqualTo(id);

        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"login\":\"marie\",\"password\":\"radium-glows\"}"))
            .andExpect(status().isOk());
        // already registered: can't claim twice
        mvc.perform(post("/api/auth/claim").header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"marie2\",\"email\":\"m2@sorbonne.fr\",\"password\":\"radium-glows\"}"))
            .andExpect(status().isForbidden());
    }

    @Test
    void duplicateUsernameIsConflict() throws Exception {
        register("tesla", "nikola@example.com", "alternating-current");
        MvcResult dup = register("Tesla", "other@example.com", "alternating-current");
        assertThat(dup.getResponse().getStatus()).isEqualTo(409);
    }

    @Test
    void invalidRegistrationReturnsFieldErrors() throws Exception {
        mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"a!\",\"email\":\"nope\",\"password\":\"short\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.fieldErrors.username").exists())
            .andExpect(jsonPath("$.fieldErrors.email").exists())
            .andExpect(jsonPath("$.fieldErrors.password").exists());
    }

    @Test
    void wrongPasswordIsUnauthorized() throws Exception {
        register("curie", "marie@example.com", "polonium-radium");
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"login\":\"curie\",\"password\":\"wrong-password\"}"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.message").value("Invalid username or password"));
    }

    @Test
    void protectedEndpointRequiresValidToken() throws Exception {
        mvc.perform(get("/api/players/me")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/players/me").header("Authorization", "Bearer not.a.jwt"))
            .andExpect(status().isUnauthorized());
    }
}
