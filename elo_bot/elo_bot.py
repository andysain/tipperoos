import numpy as np
import pandas as pd
from scipy.optimize import differential_evolution
from scipy.stats import poisson

SEED = 42
BASE_TOTAL_GOALS = 2.55
MAX_SCORE = 10
LAMBDA_FLOOR = 0.15

np.random.seed(SEED)


def poisson_expected_score(lambda_a, lambda_b, max_score=MAX_SCORE):
    scores = np.arange(max_score + 1)
    probs_a = poisson.pmf(scores, lambda_a)
    probs_b = poisson.pmf(scores, lambda_b)
    score_grid = np.outer(probs_a, probs_b)

    # The truncated grid drops tiny high-score tails, so normalize before
    # comparing it with Elo's expected-score view of a match.
    score_grid = score_grid / score_grid.sum()
    p_win_a = np.tril(score_grid, k=-1).sum()
    p_draw = np.trace(score_grid)
    p_loss_a = np.triu(score_grid, k=1).sum()
    expected_score_a = p_win_a + 0.5 * p_draw

    return p_win_a, p_draw, p_loss_a, expected_score_a


def add_lambdas(df_matchups, form_weight, factor_goal_diff):
    base_lambda = BASE_TOTAL_GOALS / 2
    elo_goal_shift = df_matchups["elo_diff"] / factor_goal_diff / 2

    lambda_a = (
        base_lambda * (1 - form_weight)
        + df_matchups["match_goals_a"] * form_weight
        + elo_goal_shift
    ).clip(lower=LAMBDA_FLOOR)
    lambda_b = (
        base_lambda * (1 - form_weight)
        + df_matchups["match_goals_b"] * form_weight
        - elo_goal_shift
    ).clip(lower=LAMBDA_FLOOR)

    return lambda_a, lambda_b


def add_poisson_expectancy(df_matchups, lambda_a_col="lambda_a", lambda_b_col="lambda_b"):
    outcomes = [
        poisson_expected_score(row[lambda_a_col], row[lambda_b_col])
        for _, row in df_matchups.iterrows()
    ]
    outcome_cols = ["poisson_win_a", "poisson_draw", "poisson_loss_a", "poisson_expectancy"]
    return df_matchups.join(pd.DataFrame(outcomes, columns=outcome_cols, index=df_matchups.index))


def optimisation_loss(params, df_matchups):
    form_weight, factor_goal_diff = params
    lambda_a, lambda_b = add_lambdas(df_matchups, form_weight, factor_goal_diff)
    df_temp = df_matchups.assign(lambda_a=lambda_a, lambda_b=lambda_b)
    df_temp = add_poisson_expectancy(df_temp)
    error = df_temp["poisson_expectancy"] - df_temp["win_expectancy"]
    return float(np.sqrt(np.mean(error**2)))


def optimise_poisson_mapping(df_matchups):
    bounds = [
        (0.0, 1.0),      # form_weight: 0 = ignore recent form, 1 = use it fully
        (100.0, 700.0),  # factor_goal_diff: lower = stronger Elo impact on goals
    ]
    result = differential_evolution(
        optimisation_loss,
        bounds=bounds,
        args=(df_matchups,),
        seed=SEED,
        polish=True,
    )
    form_weight, factor_goal_diff = result.x
    return {
        "form_weight": form_weight,
        "factor_goal_diff": factor_goal_diff,
        "rmse": result.fun,
    }


def print_calibration_summary(df_matchups):
    df_check = df_matchups.copy()
    df_check["expectancy_error"] = df_check["poisson_expectancy"] - df_check["win_expectancy"]
    df_check["abs_expectancy_error"] = df_check["expectancy_error"].abs()

    print(
        "Calibration: "
        f"mae={df_check['abs_expectancy_error'].mean():.4f}, "
        f"max_error={df_check['abs_expectancy_error'].max():.4f}, "
        f"avg_draw={df_check['poisson_draw'].mean():.2%}"
    )
    print("Largest expectancy mismatches:")
    print(
        df_check.sort_values("abs_expectancy_error", ascending=False)
        .head(10)[
            [
                "fifa_code_a",
                "fifa_code_b",
                "win_expectancy",
                "poisson_expectancy",
                "poisson_win_a",
                "poisson_draw",
                "lambda_a",
                "lambda_b",
                "expectancy_error",
            ]
        ]
        .to_string(index=False)
    )

cols = ["fifa_code", "external_id", "elo_rating"]
df_elo = pd.read_csv("elo_bot/elo_rankings_linked.csv")[cols]
home_advantage = 50
home_teams = ["CAN", "USA", "MEX"]
df_elo["elo_rating"] += df_elo["fifa_code"].isin(home_teams)*home_advantage

df_last_10 = pd.read_csv("elo_bot/last10_games.csv")

df_last_10["attack"] = (df_last_10["GF"]/10 + df_last_10["xG"])/2
df_last_10["defence"] = (df_last_10["GA"]/10 + df_last_10["xGA"])/2
cols = ["external_id", "attack", "defence"]
# print(df_last_10.head())


# print(df_elo.head())
df = pd.merge(df_elo, df_last_10[cols], on='external_id')


df_matchups = pd.merge(df, df, how='cross', suffixes=["_a", "_b"])
df_matchups = df_matchups[df_matchups["external_id_a"] > df_matchups["external_id_b"]]

df_matchups["elo_diff"] = df_matchups["elo_rating_a"] - df_matchups["elo_rating_b"]
df_matchups["win_expectancy"] = 1/(10**-(df_matchups["elo_diff"]/400)+1)
df_matchups["match_goals_a"] = (df_matchups["attack_a"] + df_matchups["defence_b"])/2
df_matchups["match_goals_b"] = (df_matchups["attack_b"] + df_matchups["defence_a"])/2
# df_matchups["match_goals"] = df_matchups["match_goals_a"] + df_matchups["match_goals_b"]

optimised = optimise_poisson_mapping(df_matchups)
factor_goal_diff = optimised["factor_goal_diff"]
form_weight = optimised["form_weight"]

print(
    "Optimised params: "
    f"form_weight={form_weight:.3f}, "
    f"factor_goal_diff={factor_goal_diff:.1f}, "
    f"rmse={optimised['rmse']:.4f}"
)

df_matchups["lambda_a"], df_matchups["lambda_b"] = add_lambdas(
    df_matchups,
    form_weight,
    factor_goal_diff,
)
df_matchups = add_poisson_expectancy(df_matchups)
print_calibration_summary(df_matchups)

# pd.set_option('display.max_columns', 15)
# print(df_matchups)

# for ix, row in df_matchups.iterrows():
#     np.random.seed(ix)
#     print(f"{row.fifa_code_a} {poisson.rvs(row.lambda_a)} - {poisson.rvs(row.lambda_b)} {row.fifa_code_b}" )
